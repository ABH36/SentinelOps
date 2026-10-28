import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceUsageEvent } from '../database/entities/device-usage-event.entity';
import { Device } from '../database/entities/device.entity';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceUsageEvent, Device]),
    EnrollmentModule,
    AuditModule,
  ],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
