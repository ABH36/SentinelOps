import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AlertsService,
  CreateAlertDto,
  UpdateAlertStatusDto,
} from './alerts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  AlertSeverity,
  AlertStatus,
  AlertCategory,
} from '@shared/types/alert.types';

@Controller('alerts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  @RequirePermissions('devices.write')
  async create(
    @Body() dto: CreateAlertDto,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.alertsService.create(tenantId, dto);
  }

  @Get()
  @RequirePermissions('devices.read')
  async findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('severity') severity?: AlertSeverity,
    @Query('status') status?: AlertStatus,
    @Query('category') category?: AlertCategory,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.alertsService.findAll(tenantId, {
      severity,
      status,
      category,
      deviceId,
    });
  }

  @Get(':id')
  @RequirePermissions('devices.read')
  async findOne(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.alertsService.findOne(id, tenantId);
  }

  @Put(':id/status')
  @RequirePermissions('devices.write')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAlertStatusDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.alertsService.updateStatus(id, tenantId, userId, dto);
  }
}
