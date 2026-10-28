import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RemoteAction } from '../database/entities/remote-action.entity';
import { Device } from '../database/entities/device.entity';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '@shared/types/audit.types';
import {
  RemoteActionType,
  RemoteActionStatus,
  RemoteActionPriority,
  CreateRemoteActionDto,
  DeviceCommandResultDto,
} from '@shared/types/remote-action.types';
import { DeviceStatus } from '@shared/types/device.types';
import { EventsService } from '../events/events.service';
import { AgentGateway } from '../gateway/agent.gateway';

@Injectable()
export class RemoteActionsService {
  constructor(
    @InjectRepository(RemoteAction)
    private readonly actionRepository: Repository<RemoteAction>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly enrollmentService: EnrollmentService,
    private readonly auditService: AuditService,
    private readonly eventsService: EventsService,
    @Inject(forwardRef(() => AgentGateway))
    private readonly agentGateway: AgentGateway,
  ) {}

  async createAction(
    tenantId: string,
    requesterId: string,
    dto: CreateRemoteActionDto,
  ): Promise<RemoteAction> {
    const device = await this.deviceRepository.findOne({
      where: { id: dto.deviceId, tenantId },
    });

    if (!device) {
      throw new NotFoundException('Target device not found');
    }

    // High risk actions (WIPE, RETIRE, SHUTDOWN) require approval by default
    const isHighRisk = [
      RemoteActionType.WIPE,
      RemoteActionType.RETIRE,
      RemoteActionType.SHUTDOWN,
    ].includes(dto.actionType);

    const requiresApproval = dto.requiresApproval ?? isHighRisk;

    const action = this.actionRepository.create({
      actionType: dto.actionType,
      priority: dto.priority || RemoteActionPriority.NORMAL,
      payload: dto.payload || {},
      status: requiresApproval ? RemoteActionStatus.PENDING : RemoteActionStatus.QUEUED,
      requiresApproval,
      isApproved: !requiresApproval,
      deviceId: device.id,
      requestedBy: requesterId,
      tenantId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours expiry
    });

    const saved = await this.actionRepository.save(action);

    this.eventsService.emit('remote-action:updated', {
      tenantId,
      deviceId: device.id,
      action: saved,
    });

    await this.auditService.logEvent({
      eventType: AuditEventType.REMOTE_ACTION_INITIATED,
      tenantId,
      userId: requesterId,
      deviceId: device.id,
      details: {
        actionId: saved.id,
        actionType: saved.actionType,
        requiresApproval,
        status: saved.status,
      },
    });

    // Dispatch via WebSocket if device is connected and command is approved/queued
    if (!requiresApproval || saved.isApproved) {
      const dispatched = this.agentGateway.dispatchCommand(device.id, saved);
      if (dispatched) {
        // Update status to DISPATCHED if successfully sent via WebSocket
        saved.status = RemoteActionStatus.DISPATCHED;
        saved.dispatchedAt = new Date();
        await this.actionRepository.save(saved);
      }
      // If not dispatched (device offline), agent will poll via HTTP as fallback
    }

    return saved;
  }

  /**
   * Create auto-remediation action bypassing approval workflow.
   * Used by automated security pipelines (e.g., blacklisted process kill).
   * 
   * @param params - Auto-action parameters
   * @returns Created RemoteAction
   */
  async createAutoAction(params: {
    deviceId: string;
    tenantId: string;
    actionType: RemoteActionType;
    priority: RemoteActionPriority;
    payload: Record<string, any>;
    reason?: string;
  }): Promise<RemoteAction> {
    const device = await this.deviceRepository.findOne({
      where: { id: params.deviceId, tenantId: params.tenantId },
    });

    if (!device) {
      throw new NotFoundException('Target device not found for auto-action');
    }

    const action = this.actionRepository.create({
      actionType: params.actionType,
      priority: params.priority,
      payload: params.payload,
      status: RemoteActionStatus.QUEUED,
      requiresApproval: false, // Auto-remediation bypasses approval
      isApproved: true,
      isAuto: true, // Flag for automated actions
      deviceId: device.id,
      requestedBy: 'SYSTEM_AUTO_REMEDIATION', // System-initiated
      tenantId: params.tenantId,
      expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour expiry for auto-actions
    });

    const saved = await this.actionRepository.save(action);

    this.eventsService.emit('remote-action:updated', {
      tenantId: params.tenantId,
      deviceId: device.id,
      action: saved,
    });

    await this.auditService.logEvent({
      eventType: AuditEventType.REMOTE_ACTION_INITIATED,
      tenantId: params.tenantId,
      userId: 'SYSTEM',
      deviceId: device.id,
      details: {
        actionId: saved.id,
        actionType: saved.actionType,
        isAuto: true,
        reason: params.reason || 'Automated security remediation',
        status: saved.status,
      },
    });

    // Immediately dispatch via WebSocket (URGENT priority)
    const dispatched = this.agentGateway.dispatchCommand(device.id, saved);
    if (dispatched) {
      // Update status to DISPATCHED if successfully sent via WebSocket
      saved.status = RemoteActionStatus.DISPATCHED;
      saved.dispatchedAt = new Date();
      await this.actionRepository.save(saved);
    }
    // If not dispatched (device offline), agent will poll via HTTP as fallback

    return saved;
  }

  async approveAction(
    actionId: string,
    approverId: string,
    tenantId: string,
  ): Promise<RemoteAction> {
    const action = await this.actionRepository.findOne({
      where: { id: actionId, tenantId },
      relations: ['device'],
    });

    if (!action) {
      throw new NotFoundException('Remote action not found');
    }

    if (action.status !== RemoteActionStatus.PENDING) {
      throw new BadRequestException('Action is not in PENDING status');
    }

    if (action.requestedBy === approverId) {
      throw new BadRequestException(
        'Dual-control security policy violation: Approver cannot be the same user who initiated the action',
      );
    }

    action.isApproved = true;
    action.approvedBy = approverId;
    action.approvedAt = new Date();
    action.status = RemoteActionStatus.QUEUED;

    const saved = await this.actionRepository.save(action);

    this.eventsService.emit('remote-action:updated', {
      tenantId,
      deviceId: action.deviceId,
      action: saved,
    });

    await this.auditService.logEvent({
      eventType: AuditEventType.PERMISSION_GRANTED,
      tenantId,
      userId: approverId,
      deviceId: action.deviceId,
      details: {
        actionId: saved.id,
        actionType: saved.actionType,
        approval: 'APPROVED',
      },
    });

    // Dispatch via WebSocket now that command is approved
    const dispatched = this.agentGateway.dispatchCommand(action.deviceId, saved);
    if (dispatched) {
      // Update status to DISPATCHED if successfully sent via WebSocket
      saved.status = RemoteActionStatus.DISPATCHED;
      saved.dispatchedAt = new Date();
      await this.actionRepository.save(saved);
    }

    return saved;
  }

  async getPendingCommandsForDevice(
    deviceKey: string,
    deviceSecret: string,
  ): Promise<{ commands: Array<{ id: string; actionType: RemoteActionType; payload: Record<string, any> }> }> {
    const device = await this.enrollmentService.verifyCredential(deviceKey, deviceSecret);

    const pendingActions = await this.actionRepository.find({
      where: {
        deviceId: device.id,
        status: RemoteActionStatus.QUEUED,
        isApproved: true,
      },
      order: { createdAt: 'ASC' },
      take: 5,
    });

    // Mark as dispatched
    for (const action of pendingActions) {
      action.status = RemoteActionStatus.DISPATCHED;
      action.dispatchedAt = new Date();
      await this.actionRepository.save(action);

      this.eventsService.emit('remote-action:updated', {
        tenantId: device.tenantId,
        deviceId: device.id,
        action,
      });
    }

    return {
      commands: pendingActions.map((a) => ({
        id: a.id,
        actionType: a.actionType,
        payload: a.payload || {},
      })),
    };
  }

  async submitCommandResult(
    deviceKey: string,
    deviceSecret: string,
    resultDto: DeviceCommandResultDto,
  ): Promise<RemoteAction> {
    const device = await this.enrollmentService.verifyCredential(deviceKey, deviceSecret);

    const action = await this.actionRepository.findOne({
      where: { id: resultDto.commandId, deviceId: device.id },
    });

    if (!action) {
      throw new NotFoundException('Command action not found');
    }

    action.status = resultDto.status;
    action.result = resultDto.result || {};
    action.errorMessage = resultDto.errorMessage || '';
    action.completedAt = new Date();

    const saved = await this.actionRepository.save(action);

    this.eventsService.emit('remote-action:updated', {
      tenantId: device.tenantId,
      deviceId: device.id,
      action: saved,
    });

    // If lock command succeeded, update device status to LOCKED
    if (action.actionType === RemoteActionType.LOCK && resultDto.status === RemoteActionStatus.COMPLETED) {
      await this.deviceRepository.update({ id: device.id }, { status: DeviceStatus.LOCKED });
    }

    // If unlock command succeeded, update device status to ACTIVE
    if (action.actionType === RemoteActionType.UNLOCK && resultDto.status === RemoteActionStatus.COMPLETED) {
      await this.deviceRepository.update({ id: device.id }, { status: DeviceStatus.ACTIVE });
    }

    // If retire command succeeded, mark device RETIRED
    if (action.actionType === RemoteActionType.RETIRE && resultDto.status === RemoteActionStatus.COMPLETED) {
      await this.deviceRepository.update({ id: device.id }, { status: DeviceStatus.RETIRED });
    }

    await this.auditService.logEvent({
      eventType:
        resultDto.status === RemoteActionStatus.COMPLETED
          ? AuditEventType.REMOTE_ACTION_COMPLETED
          : AuditEventType.REMOTE_ACTION_FAILED,
      tenantId: device.tenantId,
      deviceId: device.id,
      details: {
        actionId: saved.id,
        actionType: saved.actionType,
        status: saved.status,
        result: saved.result,
        errorMessage: saved.errorMessage,
      },
    });

    return saved;
  }

  async getActionHistory(deviceId: string, tenantId: string): Promise<RemoteAction[]> {
    return this.actionRepository.find({
      where: { deviceId, tenantId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }
}
