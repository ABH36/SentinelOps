import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { Employee } from './employee.entity';
import { DeviceEnrollment } from './device-enrollment.entity';
import { DeviceInventory } from './device-inventory.entity';
import { DeviceHeartbeat } from './device-heartbeat.entity';
import { PolicyAssignment } from './policy-assignment.entity';
import { DevicePlatform, DeviceStatus } from '@shared/types/device.types';

@Entity('devices')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'platform'])
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  deviceId: string;

  @Column()
  deviceName: string;

  @Column({
    type: 'enum',
    enum: DevicePlatform,
  })
  platform: DevicePlatform;

  @Column({ nullable: true })
  osVersion: string;

  @Column({
    type: 'enum',
    enum: DeviceStatus,
    default: DeviceStatus.ENROLLING,
  })
  status: DeviceStatus;

  @Column({ nullable: true })
  lastSeenAt: Date;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Tenant, (tenant) => tenant.devices)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @ManyToOne(() => Employee, (employee) => employee.devices, { nullable: true })
  @JoinColumn({ name: 'assignedEmployeeId' })
  assignedEmployee: Employee;

  @Column({ nullable: true })
  assignedEmployeeId: string;

  @OneToMany(() => DeviceEnrollment, (enrollment) => enrollment.device)
  enrollments: DeviceEnrollment[];

  @OneToMany(() => DeviceInventory, (inventory) => inventory.device)
  inventories: DeviceInventory[];

  @OneToMany(() => DeviceHeartbeat, (heartbeat) => heartbeat.device)
  heartbeats: DeviceHeartbeat[];

  @OneToMany(() => PolicyAssignment, (assignment) => assignment.device)
  policyAssignments: PolicyAssignment[];
}
