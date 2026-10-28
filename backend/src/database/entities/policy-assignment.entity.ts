import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { DevicePolicy } from './device-policy.entity';
import { Device } from './device.entity';
import { Employee } from './employee.entity';
import { Tenant } from './tenant.entity';

export enum AssignmentScope {
  ALL_DEVICES = 'ALL_DEVICES',
  SPECIFIC_DEVICES = 'SPECIFIC_DEVICES',
  SPECIFIC_EMPLOYEES = 'SPECIFIC_EMPLOYEES',
  DEVICE_GROUP = 'DEVICE_GROUP',
  EMPLOYEE_GROUP = 'EMPLOYEE_GROUP',
}

export enum AssignmentStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

@Entity('policy_assignments')
@Index(['policyId'])
@Index(['tenantId', 'status'])
export class PolicyAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: AssignmentScope,
  })
  scope: AssignmentScope;

  @Column({
    type: 'enum',
    enum: AssignmentStatus,
    default: AssignmentStatus.ACTIVE,
  })
  status: AssignmentStatus;

  @Column({ type: 'json', nullable: true })
  targetCriteria: {
    deviceIds?: string[];
    employeeIds?: string[];
    deviceGroupIds?: string[];
    employeeGroupIds?: string[];
    platform?: string[];
    osVersion?: string[];
    department?: string[];
  };

  @Column({ type: 'json', nullable: true })
  overrideSettings: Record<string, any>;

  @Column({ nullable: true })
  priority: number;

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  assignedBy: string;

  @Column({ nullable: true })
  assignedAt: Date;

  @ManyToOne(() => DevicePolicy, (policy) => policy.assignments)
  @JoinColumn({ name: 'policyId' })
  policy: DevicePolicy;

  @Column()
  policyId: string;

  @ManyToOne(() => Device, { nullable: true })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column({ nullable: true })
  deviceId: string;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ nullable: true })
  employeeId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: string;
}
