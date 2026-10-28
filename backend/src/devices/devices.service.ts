import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../database/entities/device.entity';
import { DeviceCredential } from '../database/entities/device-credential.entity';
import { DeviceStatus, DevicePlatform } from '@shared/types/device.types';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '@shared/types/audit.types';

export interface CreateDeviceDto {
  deviceId: string;
  deviceName: string;
  platform: DevicePlatform;
  osVersion?: string;
  tenantId: string;
  assignedEmployeeId?: string;
}

export interface UpdateDeviceDto {
  deviceName?: string;
  osVersion?: string;
  status?: DeviceStatus;
  assignedEmployeeId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(DeviceCredential)
    private readonly credentialRepository: Repository<DeviceCredential>,
    private readonly auditService: AuditService,
  ) {}

  async create(createDeviceDto: CreateDeviceDto, creatorId: string): Promise<Device> {
    const device = this.deviceRepository.create({
      ...createDeviceDto,
      status: DeviceStatus.ENROLLING,
    });

    const savedDevice = await this.deviceRepository.save(device);

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.DEVICE_ENROLLED,
      tenantId: savedDevice.tenantId,
      userId: creatorId,
      deviceId: savedDevice.id,
      details: { deviceId: savedDevice.deviceId, deviceName: savedDevice.deviceName },
    });

    return savedDevice;
  }

  async findAll(tenantId: string, filters?: {
    platform?: DevicePlatform;
    status?: DeviceStatus;
    assignedEmployeeId?: string;
  }): Promise<Device[]> {
    const where: any = { tenantId };

    if (filters?.platform) {
      where.platform = filters.platform;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.assignedEmployeeId) {
      where.assignedEmployeeId = filters.assignedEmployeeId;
    }

    return this.deviceRepository.find({
      where,
      relations: ['tenant', 'assignedEmployee'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, tenantId: string): Promise<Device> {
    const device = await this.deviceRepository.findOne({
      where: { id, tenantId },
      relations: ['tenant', 'assignedEmployee'],
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return device;
  }

  async findByDeviceId(deviceId: string, tenantId: string): Promise<Device> {
    const device = await this.deviceRepository.findOne({
      where: { deviceId, tenantId },
      relations: ['tenant', 'assignedEmployee'],
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return device;
  }

  async update(id: string, updateDeviceDto: UpdateDeviceDto, tenantId: string, updaterId: string): Promise<Device> {
    const device = await this.findOne(id, tenantId);

    Object.assign(device, updateDeviceDto);
    const updatedDevice = await this.deviceRepository.save(device);

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.SETTINGS_CHANGED,
      tenantId: device.tenantId,
      userId: updaterId,
      deviceId: device.id,
      details: { deviceId: device.deviceId, changes: updateDeviceDto },
    });

    return updatedDevice;
  }

  async remove(id: string, tenantId: string, deleterId: string): Promise<void> {
    const device = await this.findOne(id, tenantId);

    await this.deviceRepository.remove(device);

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.DEVICE_RETIRED,
      tenantId: device.tenantId,
      userId: deleterId,
      deviceId: device.id,
      details: { deviceId: device.deviceId },
    });
  }

  async updateLastSeen(id: string, tenantId: string, ipAddress?: string): Promise<void> {
    await this.deviceRepository.update(
      { id, tenantId },
      { lastSeenAt: new Date(), ipAddress },
    );
  }

  async updateStatus(id: string, status: DeviceStatus, tenantId: string): Promise<void> {
    await this.deviceRepository.update(
      { id, tenantId },
      { status },
    );
  }

  /**
   * Verify device credentials for WebSocket authentication.
   * Returns device if credentials are valid, null otherwise.
   */
  async verifyDeviceCredentials(deviceKey: string, deviceSecret: string): Promise<Device | null> {
    const credential = await this.credentialRepository.findOne({
      where: { deviceKey, deviceSecret, isActive: true },
      relations: ['enrollment', 'enrollment.device'],
    });

    if (!credential) {
      return null;
    }

    if (credential.expiresAt && credential.expiresAt < new Date()) {
      return null;
    }

    if (!credential.enrollment || !credential.enrollment.device) {
      return null;
    }

    return credential.enrollment.device;
  }

  /**
   * Update device connection status (ONLINE/OFFLINE) for WebSocket connections.
   */
  async updateConnectionStatus(id: string, connectionStatus: 'ONLINE' | 'OFFLINE'): Promise<void> {
    const updates: any = { lastSeenAt: new Date() };

    // If going online, keep current status (HEALTHY, etc.)
    // If going offline, optionally mark as OFFLINE status
    // For now, just update lastSeenAt

    await this.deviceRepository.update({ id }, updates);
  }
}
