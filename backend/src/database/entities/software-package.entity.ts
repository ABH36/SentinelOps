import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { SoftwareDeployment } from './software-deployment.entity';

export enum PackageType {
  INSTALLER = 'INSTALLER',
  SCRIPT = 'SCRIPT',
  CONFIGURATION = 'CONFIGURATION',
  UPDATE = 'UPDATE',
}

export enum PackagePlatform {
  WINDOWS = 'WINDOWS',
  ANDROID = 'ANDROID',
  CROSS_PLATFORM = 'CROSS_PLATFORM',
}

export enum PackageStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  DEPRECATED = 'DEPRECATED',
  ARCHIVED = 'ARCHIVED',
}

@Entity('software_packages')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'platform'])
export class SoftwarePackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  version: string;

  @Column({ nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: PackageType,
  })
  packageType: PackageType;

  @Column({
    type: 'enum',
    enum: PackagePlatform,
  })
  platform: PackagePlatform;

  @Column({
    type: 'enum',
    enum: PackageStatus,
    default: PackageStatus.DRAFT,
  })
  status: PackageStatus;

  @Column({ nullable: true })
  publisher: string;

  @Column({ type: 'json' })
  metadata: {
    fileUrl?: string;
    fileSize?: number;
    fileHash?: string;
    installCommand?: string;
    uninstallCommand?: string;
    prerequisites?: string[];
    dependencies?: string[];
    installTimeEstimate?: number; // in minutes
    requiresReboot?: boolean;
    silentInstall?: boolean;
    parameters?: Record<string, any>;
  };

  @Column({ type: 'json', nullable: true })
  compatibility: {
    minOsVersion?: string;
    maxOsVersion?: string;
    requiredRam?: number;
    requiredDiskSpace?: number;
    supportedArchitectures?: string[];
  };

  @Column({ default: 0 })
  downloadCount: number;

  @Column({ default: 0 })
  deploymentCount: number;

  @Column({ default: 0 })
  successRate: number; // percentage

  @Column({ type: 'json', nullable: true })
  versionHistory: Array<{
    version: string;
    changes: string;
    releasedAt: Date;
  }>;

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

  @Column()
  tenantId: string;

  @OneToMany(() => SoftwareDeployment, (deployment) => deployment.package)
  deployments: SoftwareDeployment[];
}
