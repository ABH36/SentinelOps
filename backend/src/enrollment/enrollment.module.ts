import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentController, InstallController } from './enrollment.controller';
import { DeviceEnrollment } from '../database/entities/device-enrollment.entity';
import { DeviceCredential } from '../database/entities/device-credential.entity';
import { Device } from '../database/entities/device.entity';
import { DatabaseModule } from '../database/database.module';
import { DevicesModule } from '../devices/devices.module';
import { AuditModule } from '../audit/audit.module';

@Global()
@Module({
  imports: [
    DatabaseModule,
    DevicesModule,
    AuditModule,
    TypeOrmModule.forFeature([DeviceEnrollment, DeviceCredential, Device]),
  ],
  providers: [EnrollmentService],
  controllers: [EnrollmentController, InstallController],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
