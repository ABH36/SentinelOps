import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SoftwarePackage } from '../database/entities/software-package.entity';
import { SoftwareDeployment } from '../database/entities/software-deployment.entity';
import { Device } from '../database/entities/device.entity';
import { SoftwareController } from './software.controller';
import { SoftwareService } from './software.service';
import { RemoteActionsModule } from '../remote-actions/remote-actions.module';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SoftwarePackage, SoftwareDeployment, Device]),
    forwardRef(() => RemoteActionsModule),
    AuditModule,
    EventsModule,
  ],
  controllers: [SoftwareController],
  providers: [SoftwareService],
  exports: [SoftwareService],
})
export class SoftwareModule {}
