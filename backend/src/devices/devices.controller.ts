import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { DevicesService, CreateDeviceDto, UpdateDeviceDto } from './devices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DevicePlatform, DeviceStatus } from '@shared/types/device.types';

@Controller('devices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @RequirePermissions('devices.write')
  async create(@Body() createDeviceDto: CreateDeviceDto, @CurrentUser('id') creatorId: string) {
    return this.devicesService.create(createDeviceDto, creatorId);
  }

  @Get()
  @RequirePermissions('devices.read')
  async findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('platform') platform?: DevicePlatform,
    @Query('status') status?: DeviceStatus,
    @Query('assignedEmployeeId') assignedEmployeeId?: string,
  ) {
    return this.devicesService.findAll(tenantId, {
      platform,
      status,
      assignedEmployeeId,
    });
  }

  @Get(':id')
  @RequirePermissions('devices.read')
  async findOne(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.devicesService.findOne(id, tenantId);
  }

  @Get('by-device-id/:deviceId')
  @RequirePermissions('devices.read')
  async findByDeviceId(@Param('deviceId') deviceId: string, @CurrentUser('tenantId') tenantId: string) {
    return this.devicesService.findByDeviceId(deviceId, tenantId);
  }

  @Put(':id')
  @RequirePermissions('devices.write')
  async update(
    @Param('id') id: string,
    @Body() updateDeviceDto: UpdateDeviceDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') updaterId: string,
  ) {
    return this.devicesService.update(id, updateDeviceDto, tenantId, updaterId);
  }

  @Delete(':id')
  @RequirePermissions('devices.delete')
  async remove(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') deleterId: string,
  ) {
    return this.devicesService.remove(id, tenantId, deleterId);
  }
}
