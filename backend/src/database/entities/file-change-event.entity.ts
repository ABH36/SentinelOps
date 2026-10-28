import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Device } from './device.entity';

/**
 * FileChangeEvent entity for tracking file system modifications
 * Used for ransomware detection, data loss prevention, and insider threat monitoring
 */
@Entity('file_change_events')
@Index(['deviceId', 'detectedAt'])
@Index(['tenantId', 'detectedAt'])
@Index(['changeType'])
@Index(['fileExtension'])
export class FileChangeEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Associated device
   */
  @ManyToOne(() => Device, { nullable: false, onDelete: 'CASCADE' })
  device: Device;

  @Column({ type: 'uuid' })
  @Index()
  deviceId: string;

  /**
   * Tenant ID for multi-tenant isolation
   */
  @Column({ type: 'uuid' })
  @Index()
  tenantId: string;

  /**
   * Type of file system change (CREATED, CHANGED, DELETED, RENAMED)
   */
  @Column({ type: 'varchar', length: 20 })
  @Index()
  changeType: string;

  /**
   * Full path to the file
   */
  @Column({ type: 'text' })
  filePath: string;

  /**
   * Old file path (for RENAMED events)
   */
  @Column({ type: 'text', nullable: true })
  oldPath: string;

  /**
   * File size in bytes (0 for deleted files)
   */
  @Column({ type: 'bigint', default: 0 })
  fileSize: number;

  /**
   * File extension (e.g., ".pdf", ".docx", ".encrypted")
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  @Index()
  fileExtension: string;

  /**
   * When the file change was detected by agent
   */
  @Column({ type: 'timestamp' })
  @Index()
  detectedAt: Date;

  /**
   * Timestamp when event was received by backend
   */
  @CreateDateColumn()
  receivedAt: Date;

  /**
   * Batch ID for grouping related events
   */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  batchId: string;

  /**
   * Additional metadata and threat analysis
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    // Threat detection
    suspiciousActivity?: boolean;
    detectedThreats?: string[];
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    flagged?: boolean;
    flaggedReason?: string;

    // Ransomware indicators
    massEncryption?: boolean; // Multiple files encrypted rapidly
    suspiciousExtension?: boolean; // .encrypted, .locked, .crypted
    rapidDeletion?: boolean; // Many files deleted quickly
    
    // File classification
    fileCategory?: 'DOCUMENT' | 'IMAGE' | 'VIDEO' | 'ARCHIVE' | 'EXECUTABLE' | 'DATA' | 'UNKNOWN';
    sensitiveFile?: boolean; // Based on path or extension
    
    // Context information
    directory?: string; // Parent directory name (e.g., "Documents", "Desktop")
    fileName?: string; // File name without path
    
    // Behavioral analysis
    partOfMassOperation?: boolean; // Part of bulk file operation
    operationCount?: number; // Number of operations in batch
    operationVelocity?: number; // Operations per second
    
    // Additional info
    userName?: string; // User associated with device
    processName?: string; // Process that triggered change (if available)
  };
}
