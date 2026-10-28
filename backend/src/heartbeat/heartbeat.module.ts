import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HeartbeatService } from './heartbeat.service';
import { HeartbeatController } from './heartbeat.controller';
import { GeocurfewService } from './geocurfew.service';
import { DeviceHeartbeat } from '../database/entities/device-heartbeat.entity';
import { Device } from '../database/entities/device.entity';
import { DatabaseModule } from '../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { AlertsModule } from '../alerts/alerts.module';
import { RemoteActionsModule } from '../remote-actions/remote-actions.module';
import { PoliciesModule } from '../policies/policies.module';

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    EnrollmentModule,
    AlertsModule,
    PoliciesModule,
    forwardRef(() => RemoteActionsModule),
    TypeOrmModule.forFeature([DeviceHeartbeat, Device]),
  ],
  providers: [HeartbeatService, GeocurfewService],
  controllers: [HeartbeatController],
  exports: [HeartbeatService, GeocurfewService],
})
export class HeartbeatModule {}
