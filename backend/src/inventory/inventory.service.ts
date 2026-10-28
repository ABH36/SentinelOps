import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceInventory } from '../database/entities/device-inventory.entity';
import { Device } from '../database/entities/device.entity';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { AuditService } from '../audit/audit.service';
import { DeviceInventory as DeviceInventoryType } from '@shared/types/device.types';
import { AuditEventType } from '@shared/types/audit.types';

export interface SubmitInventoryDto {
  deviceKey: string;
  deviceSecret: string;
  hardware: DeviceInventoryType['hardware'];
  operatingSystem: DeviceInventoryType['operatingSystem'];
  network: DeviceInventoryType['network'];
  software?: DeviceInventoryType['software'];
  security?: DeviceInventoryType['security'];
  agent?: DeviceInventoryType['agent'];
  metadata?: Record<string, any>;
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(DeviceInventory)
    private readonly inventoryRepository: Repository<DeviceInventory>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly enrollmentService: EnrollmentService,
    private readonly auditService: AuditService,
  ) {}

  async submitInventory(submitInventoryDto: SubmitInventoryDto, ipAddress?: string): Promise<DeviceInventory> {
    // Verify device credentials
    const device = await this.enrollmentService.verifyCredential(
      submitInventoryDto.deviceKey,
      submitInventoryDto.deviceSecret,
    );

    // Create inventory record
    const inventory = this.inventoryRepository.create({
      hardware: submitInventoryDto.hardware,
      operatingSystem: submitInventoryDto.operatingSystem,
      network: submitInventoryDto.network,
      software: submitInventoryDto.software,
      security: submitInventoryDto.security,
      agent: submitInventoryDto.agent,
      metadata: submitInventoryDto.metadata,
      deviceId: device.id,
    });

    const savedInventory = await this.inventoryRepository.save(inventory);

    // Update device last seen
    await this.deviceRepository.update(
      { id: device.id },
      { lastSeenAt: new Date(), ipAddress },
    );

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.INVENTORY_SUBMITTED,
      tenantId: device.tenantId,
      deviceId: device.id,
      details: { deviceId: device.deviceId },
      ipAddress,
    });

    return savedInventory;
  }

  async getLatestInventory(deviceId: string, tenantId: string): Promise<DeviceInventory> {
    const inventory = await this.inventoryRepository.findOne({
      where: { deviceId },
      order: { createdAt: 'DESC' },
    });

    if (!inventory) {
      throw new NotFoundException('No inventory found for device');
    }

    return inventory;
  }

  async getInventoryHistory(
    deviceId: string,
    tenantId: string,
    limit: number = 10,
    offset: number = 0,
  ): Promise<{ inventories: DeviceInventory[]; total: number }> {
    const [inventories, total] = await this.inventoryRepository.findAndCount({
      where: { deviceId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { inventories, total };
  }
}
