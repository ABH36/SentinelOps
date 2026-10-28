import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Device } from '../database/entities/device.entity';
import { DeviceEnrollment } from '../database/entities/device-enrollment.entity';
import { EnrollmentStatus } from '@shared/types/enrollment.types';
import { DeviceStatus } from '@shared/types/device.types';
import { HeartbeatService } from '../heartbeat/heartbeat.service';

@Injectable()
export class JobsService {
  constructor(
    @InjectQueue('heartbeat-timeout')
    private readonly heartbeatQueue: Queue,
    @InjectQueue('enrollment-cleanup')
    private readonly enrollmentCleanupQueue: Queue,
    @InjectQueue('audit-archival')
    private readonly auditArchivalQueue: Queue,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(DeviceEnrollment)
    private readonly enrollmentRepository: Repository<DeviceEnrollment>,
    private readonly heartbeatService: HeartbeatService,
  ) {}

  // Schedule heartbeat timeout check every 5 minutes
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkHeartbeatTimeouts() {
    // Find devices that haven't sent heartbeat in 10 minutes
    const timeoutThreshold = new Date();
    timeoutThreshold.setMinutes(timeoutThreshold.getMinutes() - 10);

    // Use query builder for complex condition
    const trulyOffline = await this.deviceRepository
      .createQueryBuilder('device')
      .where('device.status = :status', { status: DeviceStatus.ACTIVE })
      .andWhere(
        '(device.lastSeenAt IS NULL OR device.lastSeenAt < :threshold)',
        { threshold: timeoutThreshold },
      )
      .getMany();

    for (const device of trulyOffline) {
      await this.heartbeatService.markDeviceOffline(device.id, device.tenantId);
      await this.heartbeatQueue.add(
        'device-offline',
        { deviceId: device.id, tenantId: device.tenantId },
        { removeOnComplete: true },
      );
    }
  }

  // Schedule enrollment cleanup every hour
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredEnrollments() {
    // Use query builder for expired tokens
    const trulyExpired = await this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .where('enrollment.status = :status', { status: EnrollmentStatus.PENDING })
      .andWhere('enrollment.expiresAt < :now', { now: new Date() })
      .getMany();

    for (const enrollment of trulyExpired) {
      enrollment.status = EnrollmentStatus.EXPIRED;
      await this.enrollmentRepository.save(enrollment);

      await this.enrollmentCleanupQueue.add(
        'enrollment-expired',
        { enrollmentId: enrollment.id },
        { removeOnComplete: true },
      );
    }
  }

  // Schedule audit archival daily at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async archiveOldAuditLogs() {
    // Archive audit logs older than 90 days
    const archivalThreshold = new Date();
    archivalThreshold.setDate(archivalThreshold.getDate() - 90);

    await this.auditArchivalQueue.add(
      'archive-audit-logs',
      { threshold: archivalThreshold },
      { removeOnComplete: true },
    );
  }

  // Manual trigger for heartbeat check
  async triggerHeartbeatCheck() {
    await this.checkHeartbeatTimeouts();
  }

  // Manual trigger for enrollment cleanup
  async triggerEnrollmentCleanup() {
    await this.cleanupExpiredEnrollments();
  }

  // Manual trigger for audit archival
  async triggerAuditArchival() {
    await this.archiveOldAuditLogs();
  }
}
