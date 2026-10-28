import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { UsageService } from './usage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IngestUsageEventsDto } from '@shared/types/usage.types';

@Controller('usage')
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  // Device Agent: Ingest activity and foreground application events
  @Post('submit')
  async submitUsageEvents(
    @Headers('x-device-key') deviceKey: string,
    @Headers('x-device-secret') deviceSecret: string,
    @Body() dto: IngestUsageEventsDto,
  ) {
    if (!deviceKey || !deviceSecret) {
      throw new UnauthorizedException('Device credentials required in headers');
    }
    return this.usageService.ingestEvents(deviceKey, deviceSecret, dto);
  }

  // Admin: Get device usage summary (active time, idle time, top applications)
  @Get('device/:deviceId/summary')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('devices.read')
  async getDeviceUsageSummary(
    @Param('deviceId') deviceId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.usageService.getDeviceUsageSummary(deviceId, tenantId, start, end);
  }

  // Admin: Get raw event log for granular evidence audit
  @Get('device/:deviceId/events')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('devices.read')
  async getRawEvents(
    @Param('deviceId') deviceId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.usageService.getRawEvents(
      deviceId,
      tenantId,
      limit ? Number(limit) : 100,
      offset ? Number(offset) : 0,
    );
  }

  // Admin: Export verifiable evidence bundle
  @Get('device/:deviceId/export')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('audit.read')
  async exportEvidence(
    @Param('deviceId') deviceId: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.usageService.exportEvidenceBundle(deviceId, tenantId, userId, start, end);
  }
}
