import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Request,
  BadRequestException,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ClipboardService, SubmitClipboardEventDto } from './clipboard.service';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly clipboardService: ClipboardService) {}

  /**
   * Submit clipboard event from agent
   * POST /telemetry/clipboard
   */
  @Post('clipboard')
  async submitClipboardEvent(
    @Body() body: SubmitClipboardEventDto,
    @Request() req: { headers?: { 'x-device-key'?: string; 'x-device-secret'?: string } },
  ) {
    // Verify device credentials (basic validation)
    const deviceKey = req.headers?.['x-device-key'];
    const deviceSecret = req.headers?.['x-device-secret'];

    if (!deviceKey || !deviceSecret) {
      throw new BadRequestException('Device credentials required');
    }

    // In production, verify credentials and get deviceId + tenantId from database
    // For now, we'll extract from the request or body
    // TODO: Implement proper device authentication
    const deviceId = body['deviceId'] || deviceKey; // Temporary
    const tenantId = body['tenantId'] || 'default-tenant'; // Temporary

    try {
      const event = await this.clipboardService.submitClipboardEvent(
        deviceId,
        tenantId,
        body,
      );

      return {
        success: true,
        eventId: event.id,
        flagged: event.metadata?.flagged || false,
        riskLevel: event.metadata?.riskLevel || 'LOW',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get clipboard events for a device
   * GET /telemetry/clipboard/device/:deviceId
   */
  @Get('clipboard/device/:deviceId')
  async getDeviceClipboardEvents(
    @Param('deviceId') deviceId: string,
    @Query('tenantId') tenantId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const result = await this.clipboardService.getDeviceClipboardEvents(
      deviceId,
      tenantId,
      limit,
      offset,
    );

    return {
      success: true,
      ...result,
    };
  }

  /**
   * Get flagged clipboard events (sensitive data detected)
   * GET /telemetry/clipboard/flagged
   */
  @Get('clipboard/flagged')
  async getFlaggedEvents(
    @Query('tenantId') tenantId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const result = await this.clipboardService.getFlaggedEvents(
      tenantId,
      limit,
      offset,
    );

    return {
      success: true,
      ...result,
    };
  }

  /**
   * Search clipboard content
   * GET /telemetry/clipboard/search
   */
  @Get('clipboard/search')
  async searchContent(
    @Query('tenantId') tenantId: string,
    @Query('q') searchTerm: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    if (!searchTerm) {
      throw new BadRequestException('Search term required');
    }

    const events = await this.clipboardService.searchContent(
      tenantId,
      searchTerm,
      limit,
    );

    return {
      success: true,
      events,
      count: events.length,
    };
  }

  /**
   * Get clipboard statistics
   * GET /telemetry/clipboard/statistics
   */
  @Get('clipboard/statistics')
  async getStatistics(@Query('tenantId') tenantId: string) {
    const stats = await this.clipboardService.getStatistics(tenantId);

    return {
      success: true,
      statistics: stats,
    };
  }
}
