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
import { PolicyAssignment } from './policy-assignment.entity';

export enum PolicyType {
  DEVICE = 'DEVICE',
  SOFTWARE = 'SOFTWARE',
  SECURITY = 'SECURITY',
  NETWORK = 'NETWORK',
  COMPLIANCE = 'COMPLIANCE',
}

export enum PolicySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum PolicyStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
  ARCHIVED = 'ARCHIVED',
}

@Entity('device_policies')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'policyType'])
export class DevicePolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: PolicyType,
  })
  policyType: PolicyType;

  @Column({
    type: 'enum',
    enum: PolicySeverity,
    default: PolicySeverity.MEDIUM,
  })
  severity: PolicySeverity;

  @Column({
    type: 'enum',
    enum: PolicyStatus,
    default: PolicyStatus.DRAFT,
  })
  status: PolicyStatus;

  @Column({ type: 'json' })
  rules: {
    conditions: Array<{
      field: string;
      operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'notContains' | 'in' | 'notIn';
      value: any;
      logicalOperator?: 'AND' | 'OR';
    }>;
    actions: Array<{
      type: 'ALERT' | 'BLOCK' | 'REMEDIATE' | 'NOTIFY' | 'LOG';
      parameters?: Record<string, any>;
    }>;
    evaluationCriteria: {
      requireAllConditions?: boolean;
      evaluationFrequency?: 'ON_CHANGE' | 'HOURLY' | 'DAILY' | 'WEEKLY';
    };
  };

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @Column({ nullable: true })
  version: string;

  @Column({ type: 'json', nullable: true })
  versionHistory: Array<{
    version: string;
    changes: string;
    changedAt: Date;
    changedBy: string;
  }>;

  @Column({ default: true })
  isDefault: boolean;

  @Column({ nullable: true })
  effectiveFrom: Date;

  @Column({ nullable: true })
  effectiveUntil: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy: string;

  @Column({ nullable: true })
  updatedBy: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @OneToMany(() => PolicyAssignment, (assignment) => assignment.policy)
  assignments: PolicyAssignment[];
}
