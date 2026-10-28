import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import * as crypto from 'crypto';
import { DeviceUsageEvent } from '../database/entities/device-usage-event.entity';
import { Device } from '../database/entities/device.entity';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { AuditService } from '../audit/audit.service';
import {
  IngestUsageEventsDto,
  UsageSummaryReport,
} from '@shared/types/usage.types';
import { AuditEventType } from '@shared/types/audit.types';

@Injectable()
export class UsageService {
  constructor(
    @InjectRepository(DeviceUsageEvent)
    private readonly usageRepository: Repository<DeviceUsageEvent>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly enrollmentService: EnrollmentService,
    private readonly auditService: AuditService,
  ) {}

  async ingestEvents(
    deviceKey: string,
    deviceSecret: string,
    dto: IngestUsageEventsDto,
  ): Promise<{ ingestedCount: number }> {
    const device = await this.enrollmentService.verifyCredential(deviceKey, deviceSecret);

    // Get the most recent previous hash for chain continuity
    const latestEvent = await this.usageRepository.findOne({
      where: { deviceId: device.id },
      order: { createdAt: 'DESC' },
    });

    let previousHash = latestEvent?.provenanceHash || 'INITIAL_HASH_GENESIS';

    const entities: DeviceUsageEvent[] = [];

    for (const event of dto.events) {
      const eventTimestamp = new Date(event.timestamp);

      // Simple work hours check: Mon-Fri, 9am - 6pm (can be overridden by policy)
      const day = eventTimestamp.getDay();
      const hour = eventTimestamp.getHours();
      const isWorkHours = day >= 1 && day <= 5 && hour >= 9 && hour < 18;

      // Cryptographic hash for immutable evidence provenance
      const hashPayload = JSON.stringify({
        deviceId: device.id,
        tenantId: device.tenantId,
        process: event.activeWindowProcess,
        title: event.activeWindowTitle,
        activeDuration: event.activeDurationSeconds,
        idleDuration: event.idleDurationSeconds,
        timestamp: eventTimestamp.toISOString(),
        previousHash,
      });

      const provenanceHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

      const entity = this.usageRepository.create({
        deviceId: device.id,
        tenantId: device.tenantId,
        employeeId: device.assignedEmployeeId,
        activeWindowProcess: event.activeWindowProcess,
        activeWindowTitle: event.activeWindowTitle,
        activeDurationSeconds: event.activeDurationSeconds,
        idleDurationSeconds: event.idleDurationSeconds,
        activityState: event.activityState,
        isWorkHours,
        timestamp: eventTimestamp,
        provenanceHash,
        previousHash,
        metadata: event.metadata,
      });

      entities.push(entity);
      previousHash = provenanceHash;
    }

    if (entities.length > 0) {
      await this.usageRepository.save(entities);

      // Update device last seen
      await this.deviceRepository.update({ id: device.id }, { lastSeenAt: new Date() });
    }

    return { ingestedCount: entities.length };
  }

  async getDeviceUsageSummary(
    deviceId: string,
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<UsageSummaryReport> {
    const device = await this.deviceRepository.findOne({
      where: { id: deviceId, tenantId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const events = await this.usageRepository.find({
      where: {
        deviceId,
        tenantId,
        timestamp: Between(start, end),
      },
      order: { timestamp: 'ASC' },
    });

    let totalActiveSeconds = 0;
    let totalIdleSeconds = 0;
    const processDurations = new Map<string, number>();
    const hourlyBuckets = new Map<string, { active: number; idle: number }>();

    // Standard list of work/productivity tools vs non-work
    const productiveKeywords = [
      'code', 'devenv', 'teams', 'slack', 'outlook', 'excel', 'winword', 'powerpnt', 'terminal', 'powershell', 'chrome', 'edge'
    ];

    for (const ev of events) {
      totalActiveSeconds += ev.activeDurationSeconds || 0;
      totalIdleSeconds += ev.idleDurationSeconds || 0;

      const proc = (ev.activeWindowProcess || 'unknown').toLowerCase();
      const current = processDurations.get(proc) || 0;
      processDurations.set(proc, current + (ev.activeDurationSeconds || 0));

      const hourKey = ev.timestamp.toISOString().substring(11, 13) + ':00';
      const bucket = hourlyBuckets.get(hourKey) || { active: 0, idle: 0 };
      bucket.active += ev.activeDurationSeconds || 0;
      bucket.idle += ev.idleDurationSeconds || 0;
      hourlyBuckets.set(hourKey, bucket);
    }

    const topApplications = Array.from(processDurations.entries())
      .map(([processName, totalSeconds]) => ({
        processName,
        totalSeconds,
        percentage: totalActiveSeconds > 0 ? Math.round((totalSeconds / totalActiveSeconds) * 100) : 0,
        isProductive: productiveKeywords.some((k) => processName.includes(k)),
      }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .slice(0, 10);

    const hourlyTimeline = Array.from(hourlyBuckets.entries()).map(([hour, val]) => ({
      hour,
      activeSeconds: val.active,
      idleSeconds: val.idle,
    }));

    return {
      deviceId: device.id,
      deviceName: device.deviceName,
      periodStart: start,
      periodEnd: end,
      totalActiveSeconds,
      totalIdleSeconds,
      topApplications,
      hourlyTimeline,
    };
  }

  async getRawEvents(
    deviceId: string,
    tenantId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<{ events: DeviceUsageEvent[]; total: number }> {
    const [events, total] = await this.usageRepository.findAndCount({
      where: { deviceId, tenantId },
      order: { timestamp: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { events, total };
  }

  async exportEvidenceBundle(
    deviceId: string,
    tenantId: string,
    requesterId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const summary = await this.getDeviceUsageSummary(deviceId, tenantId, startDate, endDate);
    const { events } = await this.getRawEvents(deviceId, tenantId, 1000, 0);

    // Audit log evidence export for HR/legal compliance
    await this.auditService.logEvent({
      eventType: AuditEventType.DATA_EXPORTED,
      tenantId,
      userId: requesterId,
      deviceId,
      details: {
        exportType: 'USAGE_EVIDENCE_BUNDLE',
        periodStart: summary.periodStart,
        periodEnd: summary.periodEnd,
        eventCount: events.length,
      },
    });

    return {
      metadata: {
        exportTimestamp: new Date().toISOString(),
        exportedBy: requesterId,
        deviceId,
        tenantId,
        legalNotice:
          'This report contains factual endpoint telemetry collected in accordance with organizational device management policies. Facts are recorded objectively; policy interpretation requires context.',
      },
      summary,
      evidenceRecords: events.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        process: e.activeWindowProcess,
        title: e.activeWindowTitle,
        activeDurationSeconds: e.activeDurationSeconds,
        idleDurationSeconds: e.idleDurationSeconds,
        isWorkHours: e.isWorkHours,
        provenanceHash: e.provenanceHash,
        previousHash: e.previousHash,
      })),
    };
  }
}
