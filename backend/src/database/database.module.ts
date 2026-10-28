import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { Employee } from './entities/employee.entity';
import { Device } from './entities/device.entity';
import { DeviceEnrollment } from './entities/device-enrollment.entity';
import { DeviceCredential } from './entities/device-credential.entity';
import { DeviceInventory } from './entities/device-inventory.entity';
import { DeviceHeartbeat } from './entities/device-heartbeat.entity';
import { AuditEvent } from './entities/audit-event.entity';
import { DevicePolicy } from './entities/device-policy.entity';
import { PolicyAssignment } from './entities/policy-assignment.entity';
import { SoftwarePackage } from './entities/software-package.entity';
import { SoftwareDeployment } from './entities/software-deployment.entity';
import { Alert } from './entities/alert.entity';
import { RemoteAction } from './entities/remote-action.entity';
import { DeviceUsageEvent } from './entities/device-usage-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      User,
      Role,
      Permission,
      Employee,
      Device,
      DeviceEnrollment,
      DeviceCredential,
      DeviceInventory,
      DeviceHeartbeat,
      AuditEvent,
      DevicePolicy,
      PolicyAssignment,
      SoftwarePackage,
      SoftwareDeployment,
      Alert,
      RemoteAction,
      DeviceUsageEvent,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
