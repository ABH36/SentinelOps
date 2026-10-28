import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from '../database/entities/alert.entity';
import { AuditService } from '../audit/audit.service';
import {
  AlertSeverity,
  AlertStatus,
  AlertCategory,
} from '@shared/types/alert.types';
import { AuditEventType } from '@shared/types/audit.types';

export interface CreateAlertDto {
  title: string;
  description?: string;
  severity: AlertSeverity;
  category: AlertCategory;
  deviceId?: string;
  policyId?: string;
  details?: Record<string, any>;
  remediation?: Record<string, any>;
}

export interface UpdateAlertStatusDto {
  status: AlertStatus;
  note?: string;
}

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    private readonly auditService: AuditService,
  ) {}

  async create(tenantId: string, dto: CreateAlertDto): Promise<Alert> {
    if (dto.deviceId) {
      const existing = await this.alertRepository.findOne({
        where: {
          tenantId,
          deviceId: dto.deviceId,
          title: dto.title,
          status: AlertStatus.OPEN,
        },
      });
      if (existing) {
        existing.occurrenceCount = (existing.occurrenceCount || 1) + 1;
        existing.lastOccurrenceAt = new Date();
        if (dto.details) existing.details = dto.details;
        return this.alertRepository.save(existing);
      }
    }

    const alert = this.alertRepository.create({
      ...dto,
      tenantId,
      status: AlertStatus.OPEN,
      occurrenceCount: 1,
      firstOccurrenceAt: new Date(),
      lastOccurrenceAt: new Date(),
    });

    return this.alertRepository.save(alert);
  }

  async findAll(
    tenantId: string,
    filters?: {
      severity?: AlertSeverity;
      status?: AlertStatus;
      category?: AlertCategory;
      deviceId?: string;
    },
  ): Promise<Alert[]> {
    const where: any = { tenantId };
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.status) where.status = filters.status;
    if (filters?.category) where.category = filters.category;
    if (filters?.deviceId) where.deviceId = filters.deviceId;

    return this.alertRepository.find({
      where,
      relations: ['device', 'policy'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, tenantId: string): Promise<Alert> {
    const alert = await this.alertRepository.findOne({
      where: { id, tenantId },
      relations: ['device', 'policy'],
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    return alert;
  }

  async updateStatus(
    id: string,
    tenantId: string,
    userId: string,
    dto: UpdateAlertStatusDto,
  ): Promise<Alert> {
    const alert = await this.findOne(id, tenantId);

    alert.status = dto.status;

    if (dto.status === AlertStatus.ACKNOWLEDGED) {
      alert.acknowledgedBy = userId;
      alert.acknowledgedAt = new Date();
      alert.acknowledgmentNote = dto.note || '';
    } else if (dto.status === AlertStatus.RESOLVED) {
      alert.resolvedBy = userId;
      alert.resolvedAt = new Date();
      alert.resolutionNote = dto.note || '';
    }

    const saved = await this.alertRepository.save(alert);

    await this.auditService.logEvent({
      eventType: AuditEventType.SETTINGS_CHANGED,
      tenantId,
      userId,
      deviceId: alert.deviceId,
      details: {
        action: 'ALERT_STATUS_UPDATED',
        alertId: alert.id,
        newStatus: dto.status,
        note: dto.note,
      },
    });

    return saved;
  }
}
