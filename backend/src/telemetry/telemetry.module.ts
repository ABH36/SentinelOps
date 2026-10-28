import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryController } from './telemetry.controller';
import { ClipboardService } from './clipboard.service';
import { ClipboardEvent } from '../database/entities/clipboard-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ClipboardEvent])],
  controllers: [TelemetryController],
  providers: [ClipboardService],
  exports: [ClipboardService],
})
export class TelemetryModule {}
