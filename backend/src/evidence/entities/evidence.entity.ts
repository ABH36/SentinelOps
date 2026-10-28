import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Device } from '../../database/entities/device.entity';

export enum EvidenceType {
  FORENSIC_BUNDLE = 'FORENSIC_BUNDLE',
  SCREENSHOT = 'SCREENSHOT',
  LOG_FILE = 'LOG_FILE',
  MEMORY_DUMP = 'MEMORY_DUMP',
  NETWORK_CAPTURE = 'NETWORK_CAPTURE',
  FILE_ARTIFACT = 'FILE_ARTIFACT',
  OTHER = 'OTHER',
}

export enum EvidenceStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  ANALYZED = 'ANALYZED',
  ARCHIVED = 'ARCHIVED',
  DELETED = 'DELETED',
}

/**
 * Evidence entity for storing forensic artifacts and diagnostic bundles.
 * Supports incident response, security investigations, and compliance audits.
 */
@Entity('evidence')
@Index(['deviceId', 'createdAt'])
@Index(['type', 'status'])
@Index(['bundleId'])
export class Evidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Unique identifier for forensic bundles (human-readable)
   * Format: FB-YYYYMMDD-XXXX (e.g., FB-20261027-A3F2)
   */
  @Column({ type: 'varchar', length: 50, unique: true })
  @Index()
  bundleId: string;

  @Column({
    type: 'enum',
    enum: EvidenceType,
    default: EvidenceType.FORENSIC_BUNDLE,
  })
  type: EvidenceType;

  @Column({
    type: 'enum',
    enum: EvidenceStatus,
    default: EvidenceStatus.UPLOADED,
  })
  status: EvidenceStatus;

  /**
   * Associated device
   */
  @ManyToOne(() => Device, { nullable: false, onDelete: 'CASCADE' })
  device: Device;

  @Column({ type: 'uuid' })
  @Index()
  deviceId: string;

  /**
   * Command ID that triggered this evidence collection (if applicable)
   */
  @Column({ type: 'uuid', nullable: true })
  commandId: string;

  /**
   * Original filename
   */
  @Column({ type: 'varchar', length: 255 })
  filename: string;

  /**
   * Storage path (S3 key, local path, etc.)
   */
  @Column({ type: 'text' })
  storagePath: string;

  /**
   * File size in bytes
   */
  @Column({ type: 'bigint' })
  sizeBytes: number;

  /**
   * MIME type
   */
  @Column({ type: 'varchar', length: 100, default: 'application/zip' })
  mimeType: string;

  /**
   * SHA256 hash of the file for integrity verification
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  sha256Hash: string;

  /**
   * Hardware hash of the device at collection time
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  hardwareHash: string;

  /**
   * Number of artifacts contained in this bundle
   */
  @Column({ type: 'int', default: 0 })
  artifactCount: number;

  /**
   * Collection duration in milliseconds
   */
  @Column({ type: 'int', nullable: true })
  collectionDurationMs: number;

  /**
   * Metadata about the evidence (JSON)
   * Contains: collection details, artifact breakdown, analysis results
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    machineName?: string;
    userName?: string;
    osVersion?: string;
    collectionStarted?: string;
    collectionCompleted?: string;
    artifactBreakdown?: {
      networkConnections?: number;
      dnsCache?: number;
      firewallRules?: number;
      runningProcesses?: number;
      scheduledTasks?: number;
      autorunEntries?: number;
      installedDrivers?: number;
      securityEvents?: number;
    };
    analysisResults?: any;
    notes?: string;
  };

  /**
   * Chain of custody log (who accessed, when, why)
   */
  @Column({ type: 'jsonb', default: [] })
  chainOfCustody: Array<{
    timestamp: string;
    userId: string;
    userName: string;
    action: 'UPLOADED' | 'ACCESSED' | 'DOWNLOADED' | 'ANALYZED' | 'ARCHIVED' | 'DELETED';
    ipAddress?: string;
    reason?: string;
  }>;

  /**
   * Retention policy (how long to keep)
   */
  @Column({ type: 'int', default: 365 })
  retentionDays: number;

  /**
   * Auto-delete date based on retention policy
   */
  @Column({ type: 'timestamp', nullable: true })
  scheduledDeletionAt: Date;

  /**
   * Tags for categorization (e.g., 'incident-2024-10', 'malware-investigation')
   */
  @Column({ type: 'simple-array', default: '' })
  tags: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
