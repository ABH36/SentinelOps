import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryController } from './telemetry.controller';
import { ClipboardService } from './clipboard.service';
import { BrowserHistoryService } from './browser-history.service';
import { PrintJobService } from './print-job.service';
import { FileEventService } from './file-event.service';
import { UsbEventService } from './usb-event.service';
import { WifiScanService } from './wifi-scan.service';
import { BluetoothScanService } from './bluetooth-scan.service';
import { MediaActivityService } from './media-activity.service';
import { SecurityEventService } from './security-event.service';
import { ClipboardEvent } from '../database/entities/clipboard-event.entity';
import { BrowserHistoryEntry } from '../database/entities/browser-history.entity';
import { PrintJob } from '../database/entities/print-job.entity';
import { FileChangeEvent } from '../database/entities/file-change-event.entity';
import { UsbEvent } from '../database/entities/usb-event.entity';
import { WifiScan } from '../database/entities/wifi-scan.entity';
import { BluetoothScan } from '../database/entities/bt-scan.entity';
import { MediaActivity } from '../database/entities/media-activity.entity';
import { SecurityEvent } from '../database/entities/security-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClipboardEvent,
      BrowserHistoryEntry,
      PrintJob,
      FileChangeEvent,
      UsbEvent,
      WifiScan,
      BluetoothScan,
      MediaActivity,
      SecurityEvent,
    ]),
  ],
  controllers: [TelemetryController],
  providers: [
    ClipboardService,
    BrowserHistoryService,
    PrintJobService,
    FileEventService,
    UsbEventService,
    WifiScanService,
    BluetoothScanService,
    MediaActivityService,
    SecurityEventService,
  ],
  exports: [
    ClipboardService,
    BrowserHistoryService,
    PrintJobService,
    FileEventService,
    UsbEventService,
    WifiScanService,
    BluetoothScanService,
    MediaActivityService,
    SecurityEventService,
  ],
})
export class TelemetryModule {}
