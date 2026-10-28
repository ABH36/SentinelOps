import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { AuditEvent as AuditEventEntity } from '../database/entities/audit-event.entity';
import { AuditEventType } from '@shared/types/audit.types';

export interface LogEventDto {
  eventType: AuditEventType;
  tenantId: string;
  userId?: string;
  deviceId?: string;
  description?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEventEntity)
    private readonly auditEventRepository: Repository<AuditEventEntity>,
  ) {}

  async logEvent(logEventDto: LogEventDto): Promise<AuditEventEntity> {
    // Get previous event hash for chain
    const previousEvent = await this.auditEventRepository.findOne({
      where: { tenantId: logEventDto.tenantId },
      order: { createdAt: 'DESC' },
    });

    const previousHash = previousEvent?.eventHash || '';

    // Create event hash for tamper evidence
    const eventString = JSON.stringify({
      eventType: logEventDto.eventType,
      tenantId: logEventDto.tenantId,
      userId: logEventDto.userId,
      deviceId: logEventDto.deviceId,
      details: logEventDto.details,
      timestamp: new Date().toISOString(),
      previousHash,
    });

    const eventHash = crypto.createHash('sha256').update(eventString).digest('hex');

    const auditEvent = this.auditEventRepository.create({
      ...logEventDto,
      previousHash,
      eventHash,
    } as any);

    return this.auditEventRepository.save(auditEvent) as unknown as Promise<AuditEventEntity>;
  }

  async findAll(tenantId: string, filters?: {
    eventType?: AuditEventType;
    userId?: string;
    deviceId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ events: AuditEventEntity[]; total: number }> {
    const queryBuilder = this.auditEventRepository
      .createQueryBuilder('audit')
      .where('audit.tenantId = :tenantId', { tenantId });

    if (filters?.eventType) {
      queryBuilder.andWhere('audit.eventType = :eventType', { eventType: filters.eventType });
    }

    if (filters?.userId) {
      queryBuilder.andWhere('audit.userId = :userId', { userId: filters.userId });
    }

    if (filters?.deviceId) {
      queryBuilder.andWhere('audit.deviceId = :deviceId', { deviceId: filters.deviceId });
    }

    if (filters?.startDate) {
      queryBuilder.andWhere('audit.createdAt >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      queryBuilder.andWhere('audit.createdAt <= :endDate', { endDate: filters.endDate });
    }

    queryBuilder.orderBy('audit.createdAt', 'DESC');

    const total = await queryBuilder.getCount();

    if (filters?.limit) {
      queryBuilder.limit(filters.limit);
    }

    if (filters?.offset) {
      queryBuilder.offset(filters.offset);
    }

    const events = await queryBuilder.getMany();

    return { events, total };
  }

  async findOne(id: string, tenantId: string): Promise<AuditEventEntity> {
    const event = await this.auditEventRepository.findOne({
      where: { id, tenantId },
      relations: ['user', 'device'],
    });

    if (!event) {
      throw new Error('Audit event not found');
    }

    return event;
  }

  async verifyChain(tenantId: string): Promise<{ isValid: boolean; brokenAt?: AuditEventEntity }> {
    const events = await this.auditEventRepository.find({
      where: { tenantId },
      order: { createdAt: 'ASC' },
    });

    if (events.length === 0) {
      return { isValid: true };
    }

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const previousEvent = i > 0 ? events[i - 1] : null;

      // Verify hash
      const eventString = JSON.stringify({
        eventType: event.eventType,
        tenantId: event.tenantId,
        userId: event.userId,
        deviceId: event.deviceId,
        details: event.details,
        timestamp: event.createdAt.toISOString(),
        previousHash: previousEvent?.eventHash || null,
      });

      const computedHash = crypto.createHash('sha256').update(eventString).digest('hex');

      if (computedHash !== event.eventHash) {
        return { isValid: false, brokenAt: event };
      }

      // Verify chain
      if (previousEvent && event.previousHash !== previousEvent.eventHash) {
        return { isValid: false, brokenAt: event };
      }
    }

    return { isValid: true };
  }

  /**
   * Verify audit chain integrity with detailed reporting
   * Returns comprehensive verification result including violations and certificate
   */
  async verifyAuditChain(tenantId: string): Promise<{
    totalEvents: number;
    isIntact: boolean;
    violations: Array<{
      eventId: string;
      eventIndex: number;
      violationType: 'HASH_MISMATCH' | 'CHAIN_BREAK';
      expectedHash?: string;
      actualHash?: string;
      expectedPreviousHash?: string;
      actualPreviousHash?: string;
      timestamp: string;
      eventType: string;
    }>;
    verifiedAt: string;
    verificationDurationMs: number;
    firstEventAt?: string;
    lastEventAt?: string;
    certificate?: string;
  }> {
    const startTime = Date.now();

    // Fetch all events in chronological order
    const events = await this.auditEventRepository.find({
      where: { tenantId },
      order: { createdAt: 'ASC' },
    });

    const totalEvents = events.length;
    const violations: any[] = [];

    if (totalEvents === 0) {
      return {
        totalEvents: 0,
        isIntact: true,
        violations: [],
        verifiedAt: new Date().toISOString(),
        verificationDurationMs: Date.now() - startTime,
      };
    }

    // Verify each event's hash and chain linkage
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const previousEvent = i > 0 ? events[i - 1] : null;
      const expectedPreviousHash = previousEvent?.eventHash || '';

      // Reconstruct event string for hash verification
      const eventString = JSON.stringify({
        eventType: event.eventType,
        tenantId: event.tenantId,
        userId: event.userId,
        deviceId: event.deviceId,
        details: event.details,
        timestamp: event.createdAt.toISOString(),
        previousHash: expectedPreviousHash,
      });

      const computedHash = crypto.createHash('sha256').update(eventString).digest('hex');

      // Check 1: Hash integrity
      if (computedHash !== event.eventHash) {
        violations.push({
          eventId: event.id,
          eventIndex: i,
          violationType: 'HASH_MISMATCH',
          expectedHash: computedHash,
          actualHash: event.eventHash,
          timestamp: event.createdAt.toISOString(),
          eventType: event.eventType,
        });
      }

      // Check 2: Chain linkage
      if (previousEvent && event.previousHash !== previousEvent.eventHash) {
        violations.push({
          eventId: event.id,
          eventIndex: i,
          violationType: 'CHAIN_BREAK',
          expectedPreviousHash: previousEvent.eventHash,
          actualPreviousHash: event.previousHash,
          timestamp: event.createdAt.toISOString(),
          eventType: event.eventType,
        });
      }
    }

    const isIntact = violations.length === 0;
    const verificationDurationMs = Date.now() - startTime;
    const verifiedAt = new Date().toISOString();

    // Generate certificate if chain is intact
    let certificate: string | undefined;
    if (isIntact) {
      certificate = this.generateComplianceCertificate({
        tenantId,
        totalEvents,
        firstEventAt: events[0].createdAt.toISOString(),
        lastEventAt: events[events.length - 1].createdAt.toISOString(),
        verifiedAt,
        verificationDurationMs,
      });
    }

    return {
      totalEvents,
      isIntact,
      violations,
      verifiedAt,
      verificationDurationMs,
      firstEventAt: events[0]?.createdAt.toISOString(),
      lastEventAt: events[events.length - 1]?.createdAt.toISOString(),
      certificate,
    };
  }

  /**
   * Generate compliance certificate for intact audit chains
   */
  private generateComplianceCertificate(data: {
    tenantId: string;
    totalEvents: number;
    firstEventAt: string;
    lastEventAt: string;
    verifiedAt: string;
    verificationDurationMs: number;
  }): string {
    const certificateData = {
      certificateType: 'AUDIT_CHAIN_INTEGRITY_CERTIFICATE',
      issuedBy: 'SentinelOps Audit Verification System',
      issuedAt: data.verifiedAt,
      tenantId: data.tenantId,
      verification: {
        totalEventsVerified: data.totalEvents,
        auditPeriodStart: data.firstEventAt,
        auditPeriodEnd: data.lastEventAt,
        verificationTimestamp: data.verifiedAt,
        verificationDurationMs: data.verificationDurationMs,
        integrityStatus: 'INTACT',
        tamperingDetected: false,
      },
      statement: [
        'This certificate attests that the audit log chain for the specified tenant',
        'has been cryptographically verified and found to be intact and unmodified.',
        'All event hashes have been validated and the chain linkage is complete.',
        'This certificate is suitable for compliance reporting and legal proceedings.',
      ].join(' '),
      cryptographicDetails: {
        hashAlgorithm: 'SHA-256',
        chainVerificationMethod: 'Sequential Hash Linkage',
        eventsVerified: data.totalEvents,
      },
      complianceFrameworks: [
        'SOX (Sarbanes-Oxley Act)',
        'HIPAA (Health Insurance Portability and Accountability Act)',
        'GDPR (General Data Protection Regulation)',
        'ISO 27001 (Information Security Management)',
        'PCI DSS (Payment Card Industry Data Security Standard)',
      ],
    };

    // Generate certificate signature
    const certificateString = JSON.stringify(certificateData, null, 2);
    const signature = crypto
      .createHash('sha256')
      .update(certificateString + data.verifiedAt)
      .digest('hex');

    const certificate = {
      ...certificateData,
      certificateSignature: signature,
      certificateId: `CERT-${data.tenantId.substring(0, 8)}-${Date.now()}`,
    };

    return JSON.stringify(certificate, null, 2);
  }

  /**
   * Get audit chain statistics
   */
  async getChainStatistics(tenantId: string): Promise<{
    totalEvents: number;
    oldestEvent: Date | null;
    newestEvent: Date | null;
    eventTypes: Record<string, number>;
    lastVerified: Date | null;
  }> {
    const events = await this.auditEventRepository.find({
      where: { tenantId },
      order: { createdAt: 'ASC' },
    });

    if (events.length === 0) {
      return {
        totalEvents: 0,
        oldestEvent: null,
        newestEvent: null,
        eventTypes: {},
        lastVerified: null,
      };
    }

    const eventTypes: Record<string, number> = {};
    events.forEach((event) => {
      eventTypes[event.eventType] = (eventTypes[event.eventType] || 0) + 1;
    });

    return {
      totalEvents: events.length,
      oldestEvent: events[0].createdAt,
      newestEvent: events[events.length - 1].createdAt,
      eventTypes,
      lastVerified: null, // Could be stored in a separate table
    };
  }
}
