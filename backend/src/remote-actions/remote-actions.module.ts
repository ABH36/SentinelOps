import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RemoteAction } from '../database/entities/remote-action.entity';
import { Device } from '../database/entities/device.entity';
import { RemoteActionsController } from './remote-actions.controller';
import { RemoteActionsService } from './remote-actions.service';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { AuditModule } from '../audit/audit.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RemoteAction, Device]),
    EnrollmentModule,
    AuditModule,
    forwardRef(() => GatewayModule),
  ],
  controllers: [RemoteActionsController],
  providers: [RemoteActionsService],
  exports: [RemoteActionsService],
})
export class RemoteActionsModule {}
