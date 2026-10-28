import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { RemoteActionsService } from './remote-actions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateRemoteActionDto,
  DeviceCommandResultDto,
} from '@shared/types/remote-action.types';

@Controller('remote-actions')
export class RemoteActionsController {
  constructor(private readonly remoteActionsService: RemoteActionsService) {}

  // Admin: Request a remote action on a device
  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('devices.remote')
  async createAction(
    @Body() dto: CreateRemoteActionDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.remoteActionsService.createAction(tenantId, userId, dto);
  }

  // Admin: Approve a pending high-risk action
  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('devices.remote')
  async approveAction(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.remoteActionsService.approveAction(id, userId, tenantId);
  }

  // Admin: View command execution history for a device
  @Get('device/:deviceId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('devices.read')
  async getDeviceActionHistory(
    @Param('deviceId') deviceId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.remoteActionsService.getActionHistory(deviceId, tenantId);
  }

  // Device Agent: Poll for pending commands
  @Get('poll')
  async pollCommands(
    @Headers('x-device-key') deviceKey: string,
    @Headers('x-device-secret') deviceSecret: string,
  ) {
    if (!deviceKey || !deviceSecret) {
      throw new UnauthorizedException('Device credentials required in headers');
    }
    return this.remoteActionsService.getPendingCommandsForDevice(deviceKey, deviceSecret);
  }

  // Device Agent: Report command execution result
  @Post('result')
  async submitResult(
    @Headers('x-device-key') deviceKey: string,
    @Headers('x-device-secret') deviceSecret: string,
    @Body() resultDto: DeviceCommandResultDto,
  ) {
    if (!deviceKey || !deviceSecret) {
      throw new UnauthorizedException('Device credentials required in headers');
    }
    return this.remoteActionsService.submitCommandResult(deviceKey, deviceSecret, resultDto);
  }
}
