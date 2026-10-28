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
import { SoftwarePackage } from './software-package.entity';
import { Device } from './device.entity';
import { Tenant } from './tenant.entity';

export enum DeploymentStatus {
  PENDING = 'PENDING',
  SCHEDULED = 'SCHEDULED',
  DOWNLOADING = 'DOWNLOADING',
  INSTALLING = 'INSTALLING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  ROLLBACK = 'ROLLBACK',
}

export enum DeploymentPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

@Entity('software_deployments')
@Index(['packageId'])
@Index(['deviceId'])
@Index(['tenantId', 'status'])
@Index(['tenantId', 'scheduledAt'])
export class SoftwareDeployment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: DeploymentStatus,
    default: DeploymentStatus.PENDING,
  })
  status: DeploymentStatus;

  @Column({
    type: 'enum',
    enum: DeploymentPriority,
    default: DeploymentPriority.NORMAL,
  })
  priority: DeploymentPriority;

  @Column({ nullable: true })
  scheduledAt: Date;

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ type: 'json', nullable: true })
  progress: {
    downloadProgress?: number;
    installProgress?: number;
    currentStep?: string;
    estimatedTimeRemaining?: number;
  };

  @Column({ type: 'json', nullable: true })
  result: {
    success: boolean;
    exitCode?: number;
    output?: string;
    error?: string;
    rebootRequired?: boolean;
  };

  @Column({ type: 'json', nullable: true })
  failureDetails: {
    stage: string;
    error: string;
    errorType: string;
    timestamp: Date;
    retryCount: number;
  };

  @Column({ default: 0 })
  retryCount: number;

  @Column({ default: 3 })
  maxRetries: number;

  @Column({ type: 'json', nullable: true })
  overrideSettings: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  deployedBy: string;

  @ManyToOne(() => SoftwarePackage, (pkg) => pkg.deployments)
  @JoinColumn({ name: 'packageId' })
  package: SoftwarePackage;

  @Column()
  packageId: string;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column()
  deviceId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: string;
}
