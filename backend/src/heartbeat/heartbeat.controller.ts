import { Controller, Post, Get, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { HeartbeatService, SubmitHeartbeatDto } from './heartbeat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('heartbeat')
export class HeartbeatController {
  constructor(private readonly heartbeatService: HeartbeatService) {}

  @Post('submit')
  async submitHeartbeat(
    @Body() submitHeartbeatDto: Omit<SubmitHeartbeatDto, 'deviceKey' | 'deviceSecret'>,
    @Request() req: { ip?: string; headers?: { 'x-device-key'?: string; 'x-device-secret'?: string } },
  ) {
    // This endpoint is called by the agent with device credentials in headers
    const deviceKey = req.headers?.['x-device-key'];
    const deviceSecret = req.headers?.['x-device-secret'];

    return this.heartbeatService.submitHeartbeat(
      {
        ...submitHeartbeatDto,
        deviceKey: deviceKey || '',
        deviceSecret: deviceSecret || '',
      },
      req.ip,
    );
  }

  @Get('device/:deviceId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('devices.read')
  async getLatestHeartbeat(
    @Param('deviceId') deviceId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.heartbeatService.getLatestHeartbeat(deviceId, tenantId);
  }

  @Get('device/:deviceId/history')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('devices.read')
  async getHeartbeatHistory(
    @Param('deviceId') deviceId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.heartbeatService.getHeartbeatHistory(
      deviceId,
      tenantId,
      limit ? parseInt(limit, 10) : 100,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  /**
   * Tamper detection endpoint for agents to report security violations.
   * Called by watchdog service when agent is killed or debugger is detected.
   * 
   * @route POST /api/telemetry/tamper
   */
  @Post('tamper')
  async reportTamperEvent(
    @Body() tamperEvent: {
      reason: string;
      details: string;
      timestamp: string;
      processName?: string;
      executablePath?: string;
      consecutiveRestarts?: number;
      hostname?: string;
      username?: string;
      processId?: number;
      parentProcess?: string;
    },
    @Request() req: { headers?: { 'x-device-key'?: string; 'x-device-secret'?: string } },
  ) {
    // Extract device credentials from headers
    const deviceKey = req.headers?.['x-device-key'];
    const deviceSecret = req.headers?.['x-device-secret'];

    if (!deviceKey || !deviceSecret) {
      throw new Error('Missing device credentials in headers');
    }

    return this.heartbeatService.handleTamperEvent(
      deviceKey,
      deviceSecret,
      tamperEvent,
    );
  }
}
