import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { Device } from './device.entity';

export enum AuditEventType {
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_MFA_ENABLED = 'USER_MFA_ENABLED',
  USER_MFA_DISABLED = 'USER_MFA_DISABLED',
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  DEVICE_ENROLLED = 'DEVICE_ENROLLED',
  DEVICE_DEREGISTERED = 'DEVICE_DEREGISTERED',
  DEVICE_LOCKED = 'DEVICE_LOCKED',
  DEVICE_UNLOCKED = 'DEVICE_UNLOCKED',
  DEVICE_RESTARTED = 'DEVICE_RESTARTED',
  DEVICE_WIPED = 'DEVICE_WIPED',
  DEVICE_RETIRED = 'DEVICE_RETIRED',
  ENROLLMENT_TOKEN_CREATED = 'ENROLLMENT_TOKEN_CREATED',
  ENROLLMENT_TOKEN_USED = 'ENROLLMENT_TOKEN_USED',
  ENROLLMENT_TOKEN_REVOKED = 'ENROLLMENT_TOKEN_REVOKED',
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',
  ROLE_CREATED = 'ROLE_CREATED',
  ROLE_UPDATED = 'ROLE_UPDATED',
  ROLE_DELETED = 'ROLE_DELETED',
  REMOTE_ACTION_INITIATED = 'REMOTE_ACTION_INITIATED',
  REMOTE_ACTION_COMPLETED = 'REMOTE_ACTION_COMPLETED',
  REMOTE_ACTION_FAILED = 'REMOTE_ACTION_FAILED',
  INVENTORY_SUBMITTED = 'INVENTORY_SUBMITTED',
  HEARTBEAT_RECEIVED = 'HEARTBEAT_RECEIVED',
  POLICY_ASSIGNED = 'POLICY_ASSIGNED',
  POLICY_REMOVED = 'POLICY_REMOVED',
  SOFTWARE_DEPLOYED = 'SOFTWARE_DEPLOYED',
  DATA_EXPORTED = 'DATA_EXPORTED',
  SETTINGS_CHANGED = 'SETTINGS_CHANGED',
}

@Entity('audit_events')
@Index(['tenantId'])
@Index(['tenantId', 'eventType'])
@Index(['tenantId', 'createdAt'])
@Index(['userId'])
@Index(['deviceId'])
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: AuditEventType,
  })
  eventType: AuditEventType;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'json', nullable: true })
  details: Record<string, any>;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ nullable: true })
  requestId: string;

  @Column({ nullable: true })
  previousHash: string;

  @Column()
  eventHash: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Tenant, (tenant) => tenant.id)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @ManyToOne(() => User, (user) => user.id, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => Device, (device) => device.id, { nullable: true })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column({ nullable: true })
  deviceId: string;
}
