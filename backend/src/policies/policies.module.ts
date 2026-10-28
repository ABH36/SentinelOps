import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevicePolicy } from '../database/entities/device-policy.entity';
import { PolicyAssignment } from '../database/entities/policy-assignment.entity';
import { PoliciesController } from './policies.controller';
import { PoliciesService } from './policies.service';
import { AuditModule } from '../audit/audit.module';
import { AlertsModule } from '../alerts/alerts.module';
import { RemoteActionsModule } from '../remote-actions/remote-actions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DevicePolicy, PolicyAssignment]),
    AuditModule,
    AlertsModule,
    forwardRef(() => RemoteActionsModule),
  ],
  controllers: [PoliciesController],
  providers: [PoliciesService],
  exports: [PoliciesService],
})
export class PoliciesModule {}
