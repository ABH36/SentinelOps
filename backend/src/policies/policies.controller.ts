import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  PoliciesService,
  CreatePolicyDto,
  UpdatePolicyDto,
  AssignPolicyDto,
} from './policies.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PolicyType, PolicyStatus } from '@shared/types/policy.types';

@Controller('policies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Post()
  @RequirePermissions('settings.write')
  async create(
    @Body() dto: CreatePolicyDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.policiesService.create(tenantId, userId, dto);
  }

  @Get()
  @RequirePermissions('devices.read')
  async findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('policyType') policyType?: PolicyType,
    @Query('status') status?: PolicyStatus,
  ) {
    return this.policiesService.findAll(tenantId, { policyType, status });
  }

  @Get('device/:deviceId')
  @RequirePermissions('devices.read')
  async getForDevice(
    @Param('deviceId') deviceId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.policiesService.getPoliciesForDevice(deviceId, tenantId);
  }

  @Get(':id')
  @RequirePermissions('devices.read')
  async findOne(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.policiesService.findOne(id, tenantId);
  }

  @Put(':id')
  @RequirePermissions('settings.write')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePolicyDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.policiesService.update(id, tenantId, userId, dto);
  }

  @Delete(':id')
  @RequirePermissions('settings.write')
  async remove(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.policiesService.remove(id, tenantId, userId);
  }

  @Post('assign')
  @RequirePermissions('settings.write')
  async assignPolicy(
    @Body() dto: AssignPolicyDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.policiesService.assignPolicy(tenantId, userId, dto);
  }
}
