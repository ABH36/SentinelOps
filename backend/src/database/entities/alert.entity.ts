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
import { Device } from './device.entity';
import { DevicePolicy } from './device-policy.entity';
import { Tenant } from './tenant.entity';

export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

export enum AlertStatus {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED',
  IGNORED = 'IGNORED',
  ESCALATED = 'ESCALATED',
}

export enum AlertCategory {
  DEVICE_OFFLINE = 'DEVICE_OFFLINE',
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  SECURITY = 'SECURITY',
  PERFORMANCE = 'PERFORMANCE',
  DEPLOYMENT = 'DEPLOYMENT',
  COMPLIANCE = 'COMPLIANCE',
  SYSTEM = 'SYSTEM',
}

@Entity('alerts')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'severity'])
@Index(['deviceId'])
@Index(['policyId'])
@Index(['createdAt'])
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: AlertSeverity,
  })
  severity: AlertSeverity;

  @Column({
    type: 'enum',
    enum: AlertStatus,
    default: AlertStatus.OPEN,
  })
  status: AlertStatus;

  @Column({
    type: 'enum',
    enum: AlertCategory,
  })
  category: AlertCategory;

  @Column({ type: 'json', nullable: true })
  details: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  metrics: {
    threshold?: number;
    actualValue?: number;
    percentage?: number;
    trend?: 'INCREASING' | 'DECREASING' | 'STABLE';
  };

  @Column({ type: 'json', nullable: true })
  remediation: {
    suggestedActions?: string[];
    automatedRemediation?: boolean;
    remediationAvailable?: boolean;
  };

  @Column({ type: 'json', nullable: true })
  notificationSettings: {
    email?: boolean;
    sms?: boolean;
    webhook?: boolean;
    notificationChannels?: string[];
  };

  @Column({ nullable: true })
  acknowledgedBy: string;

  @Column({ nullable: true })
  acknowledgedAt: Date;

  @Column({ type: 'text', nullable: true })
  acknowledgmentNote: string;

  @Column({ nullable: true })
  resolvedBy: string;

  @Column({ nullable: true })
  resolvedAt: Date;

  @Column({ type: 'text', nullable: true })
  resolutionNote: string;

  @Column({ type: 'json', nullable: true })
  escalation: {
    level?: number;
    escalatedTo?: string[];
    escalatedAt?: Date;
    escalationRule?: string;
  };

  @Column({ type: 'json', nullable: true })
  occurrenceHistory: Array<{
    timestamp: Date;
    count: number;
  }>;

  @Column({ default: 1 })
  occurrenceCount: number;

  @Column({ nullable: true })
  firstOccurrenceAt: Date;

  @Column({ nullable: true })
  lastOccurrenceAt: Date;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Device, { nullable: true })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column({ nullable: true })
  deviceId: string;

  @ManyToOne(() => DevicePolicy, { nullable: true })
  @JoinColumn({ name: 'policyId' })
  policy: DevicePolicy;

  @Column({ nullable: true })
  policyId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: string;
}
