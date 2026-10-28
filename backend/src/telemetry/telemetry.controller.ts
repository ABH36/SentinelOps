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
import { BrowserHistoryService, SubmitBrowserHistoryDto } from './browser-history.service';
import { PrintJobService, SubmitPrintJobDto } from './print-job.service';
import { FileEventService, SubmitFileEventBatchDto } from './file-event.service';
import { UsbEventService } from './usb-event.service';
import { WifiScanService } from './wifi-scan.service';
import { BluetoothScanService } from './bluetooth-scan.service';
import { MediaActivityService } from './media-activity.service';
import { SecurityEventService } from './security-event.service';

@Controller('telemetry')
export class TelemetryController {
  constructor(
    private readonly clipboardService: ClipboardService,
    private readonly browserHistoryService: BrowserHistoryService,
    private readonly printJobService: PrintJobService,
    private readonly fileEventService: FileEventService,
    private readonly usbEventService: UsbEventService,
    private readonly wifiScanService: WifiScanService,
    private readonly bluetoothScanService: BluetoothScanService,
    private readonly mediaActivityService: MediaActivityService,
    private readonly securityEventService: SecurityEventService,
  ) {}

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

  /**
   * Submit browser history from agent
   * POST /telemetry/browser-history
   */
  @Post('browser-history')
  async submitBrowserHistory(
    @Body() body: SubmitBrowserHistoryDto,
    @Request() req: { headers?: { 'x-device-key'?: string; 'x-device-secret'?: string } },
  ) {
    // Verify device credentials
    const deviceKey = req.headers?.['x-device-key'];
    const deviceSecret = req.headers?.['x-device-secret'];

    if (!deviceKey || !deviceSecret) {
      throw new BadRequestException('Device credentials required');
    }

    // In production, verify credentials and get deviceId + tenantId from database
    const deviceId = body['deviceId'] || deviceKey; // Temporary
    const tenantId = body['tenantId'] || 'default-tenant'; // Temporary

    try {
      const result = await this.browserHistoryService.submitBrowserHistory(
        deviceId,
        tenantId,
        body.entries,
      );

      return {
        success: true,
        stored: result.stored,
        flagged: result.flagged,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get browser history for a device
   * GET /telemetry/browser-history/device/:deviceId
   */
  @Get('browser-history/device/:deviceId')
  async getDeviceBrowserHistory(
    @Param('deviceId') deviceId: string,
    @Query('tenantId') tenantId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const result = await this.browserHistoryService.getDeviceBrowserHistory(
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
   * Get flagged browser history (suspicious URLs)
   * GET /telemetry/browser-history/flagged
   */
  @Get('browser-history/flagged')
  async getFlaggedBrowserHistory(
    @Query('tenantId') tenantId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const result = await this.browserHistoryService.getFlaggedBrowserHistory(
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
   * Search browser history
   * GET /telemetry/browser-history/search
   */
  @Get('browser-history/search')
  async searchBrowserHistory(
    @Query('tenantId') tenantId: string,
    @Query('q') searchTerm: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    if (!searchTerm) {
      throw new BadRequestException('Search term required');
    }

    const entries = await this.browserHistoryService.searchBrowserHistory(
      tenantId,
      searchTerm,
      limit,
    );

    return {
      success: true,
      entries,
      count: entries.length,
    };
  }

  /**
   * Get browser history statistics
   * GET /telemetry/browser-history/statistics
   */
  @Get('browser-history/statistics')
  async getBrowserHistoryStatistics(@Query('tenantId') tenantId: string) {
    const stats = await this.browserHistoryService.getStatistics(tenantId);

    return {
      success: true,
      statistics: stats,
    };
  }

  /**
   * Submit print job from agent
   * POST /telemetry/print-jobs
   */
  @Post('print-jobs')
  async submitPrintJob(
    @Body() body: SubmitPrintJobDto,
    @Request() req: { headers?: { 'x-device-key'?: string; 'x-device-secret'?: string } },
  ) {
    // Verify device credentials
    const deviceKey = req.headers?.['x-device-key'];
    const deviceSecret = req.headers?.['x-device-secret'];

    if (!deviceKey || !deviceSecret) {
      throw new BadRequestException('Device credentials required');
    }

    // In production, verify credentials and get deviceId + tenantId from database
    const deviceId = body['deviceId'] || deviceKey; // Temporary
    const tenantId = body['tenantId'] || 'default-tenant'; // Temporary

    try {
      const result = await this.printJobService.submitPrintJob(
        deviceId,
        tenantId,
        body,
      );

      return {
        success: true,
        saved: result.saved,
        flagged: result.flagged,
        riskLevel: result.riskLevel,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get print jobs for a device
   * GET /telemetry/print-jobs/device/:deviceId
   */
  @Get('print-jobs/device/:deviceId')
  async getDevicePrintJobs(
    @Param('deviceId') deviceId: string,
    @Query('tenantId') tenantId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const result = await this.printJobService.getDevicePrintJobs(
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
   * Get flagged print jobs (high risk documents)
   * GET /telemetry/print-jobs/flagged
   */
  @Get('print-jobs/flagged')
  async getFlaggedPrintJobs(
    @Query('tenantId') tenantId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const result = await this.printJobService.getFlaggedPrintJobs(
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
   * Search print jobs
   * GET /telemetry/print-jobs/search
   */
  @Get('print-jobs/search')
  async searchPrintJobs(
    @Query('tenantId') tenantId: string,
    @Query('q') searchTerm: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    if (!searchTerm) {
      throw new BadRequestException('Search term required');
    }

    const jobs = await this.printJobService.searchPrintJobs(
      tenantId,
      searchTerm,
      limit,
    );

    return {
      success: true,
      jobs,
      count: jobs.length,
    };
  }

  /**
   * Get print job statistics
   * GET /telemetry/print-jobs/statistics
   */
  @Get('print-jobs/statistics')
  async getPrintJobStatistics(@Query('tenantId') tenantId: string) {
    const stats = await this.printJobService.getStatistics(tenantId);

    return {
      success: true,
      statistics: stats,
    };
  }

  /**
   * Submit file event batch from agent
   * POST /telemetry/file-events
   */
  @Post('file-events')
  async submitFileEventBatch(
    @Body() body: SubmitFileEventBatchDto,
    @Request() req: { headers?: { 'x-device-key'?: string; 'x-device-secret'?: string } },
  ) {
    // Verify device credentials
    const deviceKey = req.headers?.['x-device-key'];
    const deviceSecret = req.headers?.['x-device-secret'];

    if (!deviceKey || !deviceSecret) {
      throw new BadRequestException('Device credentials required');
    }

    // In production, verify credentials and get deviceId + tenantId from database
    const deviceId = body['deviceId'] || deviceKey; // Temporary
    const tenantId = body['tenantId'] || 'default-tenant'; // Temporary

    try {
      const result = await this.fileEventService.submitFileEventBatch(
        deviceId,
        tenantId,
        body,
      );

      return {
        success: true,
        saved: result.saved,
        flagged: result.flagged,
        threats: result.threats,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get file events for a device
   * GET /telemetry/file-events/device/:deviceId
   */
  @Get('file-events/device/:deviceId')
  async getDeviceFileEvents(
    @Param('deviceId') deviceId: string,
    @Query('tenantId') tenantId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const result = await this.fileEventService.getDeviceFileEvents(
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
   * Get flagged file events (suspicious activity / ransomware)
   * GET /telemetry/file-events/flagged
   */
  @Get('file-events/flagged')
  async getFlaggedFileEvents(
    @Query('tenantId') tenantId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const result = await this.fileEventService.getFlaggedFileEvents(
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
   * Search file events by path
   * GET /telemetry/file-events/search
   */
  @Get('file-events/search')
  async searchFileEvents(
    @Query('tenantId') tenantId: string,
    @Query('q') searchTerm: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    if (!searchTerm) {
      throw new BadRequestException('Search term required');
    }

    const events = await this.fileEventService.searchFileEvents(
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
   * Get file event statistics
   * GET /telemetry/file-events/statistics
   */
  @Get('file-events/statistics')
  async getFileEventStatistics(@Query('tenantId') tenantId: string) {
    const stats = await this.fileEventService.getStatistics(tenantId);

    return {
      success: true,
      statistics: stats,
    };
  }

  /**
   * Submit USB event from agent
   * POST /telemetry/usb-events
   */
  @Post('usb-events')
  async submitUsbEvent(
    @Body() body: any,
    @Request() req: { headers?: { 'x-device-key'?: string; 'x-device-secret'?: string } },
  ) {
    // Verify device credentials
    const deviceKey = req.headers?.['x-device-key'];
    const deviceSecret = req.headers?.['x-device-secret'];

    if (!deviceKey || !deviceSecret) {
      throw new BadRequestException('Device credentials required');
    }

    // In production, verify credentials and get agentId from database
    const agentId = body['deviceId'] || deviceKey; // Temporary

    try {
      const event = await this.usbEventService.storeUsbEvent(agentId, body);

      return {
        success: true,
        eventId: event.id,
        riskLevel: event.riskLevel,
        isAuthorized: event.isAuthorized,
        threats: event.threats || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Submit batch of USB events from agent
   * POST /telemetry/usb-events/batch
   */
  @Post('usb-events/batch')
  async submitUsbEventBatch(
    @Body() body: { events: any[] },
    @Request() req: { headers?: { 'x-device-key'?: string; 'x-device-secret'?: string } },
  ) {
    // Verify device credentials
    const deviceKey = req.headers?.['x-device-key'];
    const deviceSecret = req.headers?.['x-device-secret'];

    if (!deviceKey || !deviceSecret) {
      throw new BadRequestException('Device credentials required');
    }

    // In production, verify credentials and get agentId from database
    const agentId = body['deviceId'] || deviceKey; // Temporary

    try {
      const events = await this.usbEventService.storeBatch(agentId, body.events);

      return {
        success: true,
        saved: events.length,
        events: events.map(e => ({
          id: e.id,
          deviceName: e.deviceName,
          riskLevel: e.riskLevel,
          isAuthorized: e.isAuthorized,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get USB events for an agent
   * GET /telemetry/usb-events/agent/:agentId
   */
  @Get('usb-events/agent/:agentId')
  async getAgentUsbEvents(
    @Param('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const events = await this.usbEventService.getAgentUsbEvents(agentId, limit, offset);

    return {
      success: true,
      events,
      count: events.length,
    };
  }

  /**
   * Get unauthorized USB events
   * GET /telemetry/usb-events/unauthorized
   */
  @Get('usb-events/unauthorized')
  async getUnauthorizedUsbEvents(
    @Query('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const events = await this.usbEventService.getUnauthorizedEvents(agentId, limit);

    return {
      success: true,
      events,
      count: events.length,
    };
  }

  /**
   * Get currently connected USB devices for an agent
   * GET /telemetry/usb-events/connected/:agentId
   */
  @Get('usb-events/connected/:agentId')
  async getConnectedDevices(@Param('agentId') agentId: string) {
    const devices = await this.usbEventService.getConnectedDevices(agentId);

    return {
      success: true,
      devices,
      count: devices.length,
    };
  }

  /**
   * Get USB event statistics
   * GET /telemetry/usb-events/statistics/:agentId
   */
  @Get('usb-events/statistics/:agentId')
  async getUsbStatistics(
    @Param('agentId') agentId: string,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    const stats = await this.usbEventService.getStatistics(agentId, days);

    return {
      success: true,
      statistics: stats,
    };
  }

  /**
   * Search USB events by device characteristics
   * GET /telemetry/usb-events/search
   */
  @Get('usb-events/search')
  async searchUsbDevices(
    @Query('agentId') agentId: string,
    @Query('deviceType') deviceType: string,
    @Query('vendorId') vendorId: string,
    @Query('productId') productId: string,
    @Query('manufacturer') manufacturer: string,
    @Query('riskLevel') riskLevel: string,
    @Query('isAuthorized') isAuthorized: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const filters: any = { limit };

    if (agentId) filters.agentId = agentId;
    if (deviceType) filters.deviceType = deviceType;
    if (vendorId) filters.vendorId = vendorId;
    if (productId) filters.productId = productId;
    if (manufacturer) filters.manufacturer = manufacturer;
    if (riskLevel) filters.riskLevel = riskLevel;
    if (isAuthorized !== undefined) filters.isAuthorized = isAuthorized === 'true';

    const events = await this.usbEventService.searchDevices(filters);

    return {
      success: true,
      events,
      count: events.length,
    };
  }

  /**
   * Submit Wi-Fi scan results from agent
   * POST /telemetry/wifi-scan
   */
  @Post('wifi-scan')
  async submitWifiScan(
    @Body() body: any,
    @Request() req: { headers?: { 'x-device-key'?: string; 'x-device-secret'?: string } },
  ) {
    // Verify device credentials
    const deviceKey = req.headers?.['x-device-key'];
    const deviceSecret = req.headers?.['x-device-secret'];

    if (!deviceKey || !deviceSecret) {
      throw new BadRequestException('Device credentials required');
    }

    // In production, verify credentials and get agentId from database
    const agentId = body['deviceId'] || deviceKey; // Temporary

    try {
      const result = await this.wifiScanService.storeScanResults(agentId, body);

      return {
        success: true,
        stored: result.stored,
        flagged: result.flagged,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get Wi-Fi scans for an agent
   * GET /telemetry/wifi-scan/agent/:agentId
   */
  @Get('wifi-scan/agent/:agentId')
  async getAgentWifiScans(
    @Param('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const scans = await this.wifiScanService.getAgentScans(agentId, limit, offset);

    return {
      success: true,
      scans,
      count: scans.length,
    };
  }

  /**
   * Get rogue/unauthorized Wi-Fi networks
   * GET /telemetry/wifi-scan/rogue
   */
  @Get('wifi-scan/rogue')
  async getRogueNetworks(
    @Query('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const networks = await this.wifiScanService.getRogueNetworks(agentId, limit);

    return {
      success: true,
      networks,
      count: networks.length,
    };
  }

  /**
   * Get open/weak security Wi-Fi networks
   * GET /telemetry/wifi-scan/insecure
   */
  @Get('wifi-scan/insecure')
  async getInsecureNetworks(
    @Query('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const networks = await this.wifiScanService.getInsecureNetworks(agentId, limit);

    return {
      success: true,
      networks,
      count: networks.length,
    };
  }

  /**
   * Search Wi-Fi networks by SSID
   * GET /telemetry/wifi-scan/search/ssid
   */
  @Get('wifi-scan/search/ssid')
  async searchWifiBySSID(
    @Query('ssid') ssid: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    if (!ssid) {
      throw new BadRequestException('SSID required');
    }

    const networks = await this.wifiScanService.searchBySSID(ssid, limit);

    return {
      success: true,
      networks,
      count: networks.length,
    };
  }

  /**
   * Search Wi-Fi networks by BSSID (AP MAC address)
   * GET /telemetry/wifi-scan/search/bssid
   */
  @Get('wifi-scan/search/bssid')
  async searchWifiByBSSID(
    @Query('bssid') bssid: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    if (!bssid) {
      throw new BadRequestException('BSSID required');
    }

    const networks = await this.wifiScanService.searchByBSSID(bssid, limit);

    return {
      success: true,
      networks,
      count: networks.length,
    };
  }

  /**
   * Get Wi-Fi scan statistics
   * GET /telemetry/wifi-scan/statistics/:agentId
   */
  @Get('wifi-scan/statistics/:agentId')
  async getWifiStatistics(
    @Param('agentId') agentId: string,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    const stats = await this.wifiScanService.getStatistics(agentId, days);

    return {
      success: true,
      statistics: stats,
    };
  }

  /**
   * Submit Bluetooth scan results from agent
   * POST /telemetry/bluetooth-scan
   */
  @Post('bluetooth-scan')
  async submitBluetoothScan(
    @Body() body: any,
    @Request() req: { headers?: { 'x-device-key'?: string; 'x-device-secret'?: string } },
  ) {
    // Verify device credentials
    const deviceKey = req.headers?.['x-device-key'];
    const deviceSecret = req.headers?.['x-device-secret'];

    if (!deviceKey || !deviceSecret) {
      throw new BadRequestException('Device credentials required');
    }

    // In production, verify credentials and get agentId from database
    const agentId = body['deviceId'] || deviceKey; // Temporary

    try {
      const result = await this.bluetoothScanService.storeScanResults(agentId, body);

      return {
        success: true,
        stored: result.stored,
        flagged: result.flagged,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get Bluetooth scans for an agent
   * GET /telemetry/bluetooth-scan/agent/:agentId
   */
  @Get('bluetooth-scan/agent/:agentId')
  async getAgentBluetoothScans(
    @Param('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const scans = await this.bluetoothScanService.getAgentScans(agentId, limit, offset);

    return {
      success: true,
      scans,
      count: scans.length,
    };
  }

  /**
   * Get unauthorized/suspicious Bluetooth devices
   * GET /telemetry/bluetooth-scan/unauthorized
   */
  @Get('bluetooth-scan/unauthorized')
  async getUnauthorizedBluetoothDevices(
    @Query('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const devices = await this.bluetoothScanService.getUnauthorizedDevices(agentId, limit);

    return {
      success: true,
      devices,
      count: devices.length,
    };
  }

  /**
   * Get suspicious Bluetooth devices
   * GET /telemetry/bluetooth-scan/suspicious
   */
  @Get('bluetooth-scan/suspicious')
  async getSuspiciousBluetoothDevices(
    @Query('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const devices = await this.bluetoothScanService.getSuspiciousDevices(agentId, limit);

    return {
      success: true,
      devices,
      count: devices.length,
    };
  }

  /**
   * Get paired Bluetooth devices for an agent
   * GET /telemetry/bluetooth-scan/paired/:agentId
   */
  @Get('bluetooth-scan/paired/:agentId')
  async getPairedBluetoothDevices(
    @Param('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const devices = await this.bluetoothScanService.getPairedDevices(agentId, limit);

    return {
      success: true,
      devices,
      count: devices.length,
    };
  }

  /**
   * Search Bluetooth devices by name
   * GET /telemetry/bluetooth-scan/search/name
   */
  @Get('bluetooth-scan/search/name')
  async searchBluetoothByName(
    @Query('name') name: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    if (!name) {
      throw new BadRequestException('Name required');
    }

    const devices = await this.bluetoothScanService.searchByName(name, limit);

    return {
      success: true,
      devices,
      count: devices.length,
    };
  }

  /**
   * Search Bluetooth devices by address (MAC address)
   * GET /telemetry/bluetooth-scan/search/address
   */
  @Get('bluetooth-scan/search/address')
  async searchBluetoothByAddress(
    @Query('address') address: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    if (!address) {
      throw new BadRequestException('Address required');
    }

    const devices = await this.bluetoothScanService.searchByAddress(address, limit);

    return {
      success: true,
      devices,
      count: devices.length,
    };
  }

  /**
   * Get Bluetooth scan statistics
   * GET /telemetry/bluetooth-scan/statistics/:agentId
   */
  @Get('bluetooth-scan/statistics/:agentId')
  async getBluetoothStatistics(
    @Param('agentId') agentId: string,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    const stats = await this.bluetoothScanService.getStatistics(agentId, days);

    return {
      success: true,
      statistics: stats,
    };
  }

  /**
   * Submit media device activity from agent
   * POST /telemetry/media-activity
   */
  @Post('media-activity')
  async submitMediaActivity(
    @Body() body: any,
    @Request() req: { headers?: { 'x-device-key'?: string; 'x-device-secret'?: string } },
  ) {
    // Verify device credentials
    const deviceKey = req.headers?.['x-device-key'];
    const deviceSecret = req.headers?.['x-device-secret'];

    if (!deviceKey || !deviceSecret) {
      throw new BadRequestException('Device credentials required');
    }

    // In production, verify credentials and get agentId from database
    const agentId = body['deviceId'] || deviceKey; // Temporary

    try {
      const activity = await this.mediaActivityService.storeMediaActivity(agentId, body);

      return {
        success: true,
        activityId: activity.id,
        riskLevel: activity.riskLevel,
        isAuthorized: activity.isAuthorized,
        threats: activity.threats || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Submit batch of media activities from agent
   * POST /telemetry/media-activity/batch
   */
  @Post('media-activity/batch')
  async submitMediaActivityBatch(
    @Body() body: { activities: any[] },
    @Request() req: { headers?: { 'x-device-key'?: string; 'x-device-secret'?: string } },
  ) {
    // Verify device credentials
    const deviceKey = req.headers?.['x-device-key'];
    const deviceSecret = req.headers?.['x-device-secret'];

    if (!deviceKey || !deviceSecret) {
      throw new BadRequestException('Device credentials required');
    }

    // In production, verify credentials and get agentId from database
    const agentId = body['deviceId'] || deviceKey; // Temporary

    try {
      const activities = await this.mediaActivityService.storeBatch(agentId, body.activities);

      return {
        success: true,
        saved: activities.length,
        activities: activities.map(a => ({
          id: a.id,
          deviceType: a.deviceType,
          processName: a.processName,
          riskLevel: a.riskLevel,
          isAuthorized: a.isAuthorized,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get media activities for an agent
   * GET /telemetry/media-activity/agent/:agentId
   */
  @Get('media-activity/agent/:agentId')
  async getAgentMediaActivities(
    @Param('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const activities = await this.mediaActivityService.getAgentMediaActivities(
      agentId,
      limit,
      offset,
    );

    return {
      success: true,
      activities,
      count: activities.length,
    };
  }

  /**
   * Get unauthorized media activities
   * GET /telemetry/media-activity/unauthorized
   */
  @Get('media-activity/unauthorized')
  async getUnauthorizedMediaActivities(
    @Query('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const activities = await this.mediaActivityService.getUnauthorizedActivities(agentId, limit);

    return {
      success: true,
      activities,
      count: activities.length,
    };
  }

  /**
   * Get active media sessions for an agent
   * GET /telemetry/media-activity/active/:agentId
   */
  @Get('media-activity/active/:agentId')
  async getActiveMediaSessions(@Param('agentId') agentId: string) {
    const sessions = await this.mediaActivityService.getActiveSessions(agentId);

    return {
      success: true,
      sessions,
      count: sessions.length,
    };
  }

  /**
   * Get media activities by device type
   * GET /telemetry/media-activity/device-type/:deviceType
   */
  @Get('media-activity/device-type/:deviceType')
  async getMediaActivitiesByDeviceType(
    @Param('deviceType') deviceType: string,
    @Query('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const activities = await this.mediaActivityService.getActivitiesByDeviceType(
      deviceType,
      agentId,
      limit,
    );

    return {
      success: true,
      activities,
      count: activities.length,
    };
  }

  /**
   * Search media activities by process name
   * GET /telemetry/media-activity/search/process
   */
  @Get('media-activity/search/process')
  async searchMediaActivitiesByProcess(
    @Query('processName') processName: string,
    @Query('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    if (!processName) {
      throw new BadRequestException('Process name required');
    }

    const activities = await this.mediaActivityService.searchByProcessName(
      processName,
      agentId,
      limit,
    );

    return {
      success: true,
      activities,
      count: activities.length,
    };
  }

  /**
   * Get media activity statistics
   * GET /telemetry/media-activity/statistics/:agentId
   */
  @Get('media-activity/statistics/:agentId')
  async getMediaActivityStatistics(
    @Param('agentId') agentId: string,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    const stats = await this.mediaActivityService.getStatistics(agentId, days);

    return {
      success: true,
      statistics: stats,
    };
  }

  /**
   * Get privacy violations (high-risk media activities)
   * GET /telemetry/media-activity/privacy-violations
   */
  @Get('media-activity/privacy-violations')
  async getPrivacyViolations(
    @Query('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const violations = await this.mediaActivityService.getPrivacyViolations(agentId, limit);

    return {
      success: true,
      violations,
      count: violations.length,
    };
  }

  /**
   * Submit security events from agent
   * POST /telemetry/security-events
   */
  @Post('security-events')
  async submitSecurityEvents(
    @Body() body: any,
    @Request() req: { headers?: { 'x-device-key'?: string; 'x-device-secret'?: string } },
  ) {
    // Verify device credentials
    const deviceKey = req.headers?.['x-device-key'];
    const deviceSecret = req.headers?.['x-device-secret'];

    if (!deviceKey || !deviceSecret) {
      throw new BadRequestException('Device credentials required');
    }

    // In production, verify credentials and get agentId from database
    const agentId = body['deviceId'] || deviceKey; // Temporary

    try {
      const result = await this.securityEventService.storeSecurityEvents(agentId, body);

      return {
        success: true,
        stored: result.stored,
        flagged: result.flagged,
        threats: result.threats,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get security events for an agent
   * GET /telemetry/security-events/agent/:agentId
   */
  @Get('security-events/agent/:agentId')
  async getAgentSecurityEvents(
    @Param('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const events = await this.securityEventService.getAgentSecurityEvents(agentId, limit, offset);

    return {
      success: true,
      events,
      count: events.length,
    };
  }

  /**
   * Get security events by event ID
   * GET /telemetry/security-events/event-id/:eventId
   */
  @Get('security-events/event-id/:eventId')
  async getSecurityEventsByEventId(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query('agentId') agentId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    if (!agentId) {
      throw new BadRequestException('Agent ID required');
    }

    const events = await this.securityEventService.getSecurityEventsByEventId(agentId, eventId, limit);

    return {
      success: true,
      events,
      count: events.length,
    };
  }

  /**
   * Get flagged security events (threats detected)
   * GET /telemetry/security-events/flagged
   */
  @Get('security-events/flagged')
  async getFlaggedSecurityEvents(
    @Query('agentId') agentId: string | null,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const events = await this.securityEventService.getFlaggedSecurityEvents(agentId, limit);

    return {
      success: true,
      events,
      count: events.length,
    };
  }

  /**
   * Get high-risk security events
   * GET /telemetry/security-events/high-risk
   */
  @Get('security-events/high-risk')
  async getHighRiskSecurityEvents(
    @Query('agentId') agentId: string | null,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const events = await this.securityEventService.getHighRiskEvents(agentId, limit);

    return {
      success: true,
      events,
      count: events.length,
    };
  }

  /**
   * Get failed logon attempts (brute force detection)
   * GET /telemetry/security-events/failed-logons/:agentId
   */
  @Get('security-events/failed-logons/:agentId')
  async getFailedLogonAttempts(
    @Param('agentId') agentId: string,
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const events = await this.securityEventService.getFailedLogonAttempts(agentId, hours, limit);

    return {
      success: true,
      events,
      count: events.length,
    };
  }

  /**
   * Get privilege escalation events
   * GET /telemetry/security-events/privilege-escalation/:agentId
   */
  @Get('security-events/privilege-escalation/:agentId')
  async getPrivilegeEscalationEvents(
    @Param('agentId') agentId: string,
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const events = await this.securityEventService.getPrivilegeEscalationEvents(agentId, hours, limit);

    return {
      success: true,
      events,
      count: events.length,
    };
  }

  /**
   * Get persistence mechanism events (scheduled tasks, services)
   * GET /telemetry/security-events/persistence/:agentId
   */
  @Get('security-events/persistence/:agentId')
  async getPersistenceEvents(
    @Param('agentId') agentId: string,
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const events = await this.securityEventService.getPersistenceEvents(agentId, hours, limit);

    return {
      success: true,
      events,
      count: events.length,
    };
  }

  /**
   * Get PowerShell execution events
   * GET /telemetry/security-events/powershell/:agentId
   */
  @Get('security-events/powershell/:agentId')
  async getPowerShellEvents(
    @Param('agentId') agentId: string,
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const events = await this.securityEventService.getPowerShellEvents(agentId, hours, limit);

    return {
      success: true,
      events,
      count: events.length,
    };
  }

  /**
   * Search security events by username
   * GET /telemetry/security-events/search/username
   */
  @Get('security-events/search/username')
  async searchSecurityEventsByUsername(
    @Query('username') username: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    if (!username) {
      throw new BadRequestException('Username required');
    }

    const events = await this.securityEventService.searchByUsername(username, limit);

    return {
      success: true,
      events,
      count: events.length,
    };
  }

  /**
   * Get security event statistics
   * GET /telemetry/security-events/statistics/:agentId
   */
  @Get('security-events/statistics/:agentId')
  async getSecurityEventStatistics(
    @Param('agentId') agentId: string,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    const stats = await this.securityEventService.getStatistics(agentId, days);

    return {
      success: true,
      statistics: stats,
    };
  }
}
