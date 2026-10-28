import { Controller, Post, Get, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { InventoryService, SubmitInventoryDto } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('submit')
  async submitInventory(
    @Body() submitInventoryDto: Omit<SubmitInventoryDto, 'deviceKey' | 'deviceSecret'>,
    @Request() req: { ip?: string; headers?: { 'x-device-key'?: string; 'x-device-secret'?: string } },
  ) {
    // This endpoint is called by the agent with device credentials in headers
    const deviceKey = req.headers?.['x-device-key'];
    const deviceSecret = req.headers?.['x-device-secret'];

    return this.inventoryService.submitInventory(
      {
        ...submitInventoryDto,
        deviceKey: deviceKey || '',
        deviceSecret: deviceSecret || '',
      },
      req.ip,
    );
  }

  @Get('device/:deviceId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('inventory.read')
  async getLatestInventory(
    @Param('deviceId') deviceId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.inventoryService.getLatestInventory(deviceId, tenantId);
  }

  @Get('device/:deviceId/history')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('inventory.read')
  async getInventoryHistory(
    @Param('deviceId') deviceId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.inventoryService.getInventoryHistory(
      deviceId,
      tenantId,
      limit ? parseInt(limit, 10) : 10,
      offset ? parseInt(offset, 10) : 0,
    );
  }
}
