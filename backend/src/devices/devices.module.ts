import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { Device } from '../database/entities/device.entity';
import { DeviceCredential } from '../database/entities/device-credential.entity';
import { Tenant } from '../database/entities/tenant.entity';
import { Employee } from '../database/entities/employee.entity';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([Device, DeviceCredential, Tenant, Employee]),
  ],
  providers: [DevicesService],
  controllers: [DevicesController],
  exports: [DevicesService],
})
export class DevicesModule {}
