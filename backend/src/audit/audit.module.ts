import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditEvent } from '../database/entities/audit-event.entity';
import { User } from '../database/entities/user.entity';
import { Device } from '../database/entities/device.entity';
import { Tenant } from '../database/entities/tenant.entity';
import { DatabaseModule } from '../database/database.module';

@Global()
@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([AuditEvent, User, Device, Tenant]),
  ],
  providers: [AuditService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
