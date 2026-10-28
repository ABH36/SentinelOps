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
 * PrintJob entity for tracking print spooler activity
 * Used for document security monitoring, data loss prevention, and compliance auditing
 */
@Entity('print_jobs')
@Index(['deviceId', 'timeSubmitted'])
@Index(['tenantId', 'timeSubmitted'])
@Index(['owner'])
@Index(['printerName'])
export class PrintJob {
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
   * Windows print job ID from spooler
   */
  @Column({ type: 'int' })
  jobId: number;

  /**
   * Document name being printed
   */
  @Column({ type: 'varchar', length: 500 })
  documentName: string;

  /**
   * Printer name (e.g., "HP LaserJet Pro", "Microsoft Print to PDF")
   */
  @Column({ type: 'varchar', length: 255 })
  @Index()
  printerName: string;

  /**
   * User who initiated the print job (domain\username)
   */
  @Column({ type: 'varchar', length: 255 })
  @Index()
  owner: string;

  /**
   * Total number of pages in the print job
   */
  @Column({ type: 'int', default: 0 })
  totalPages: number;

  /**
   * Print job status (e.g., "Printing", "Spooling", "Paused", "Complete")
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  jobStatus: string;

  /**
   * Data type of the print job (e.g., "RAW", "TEXT", "XPS")
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  dataType: string;

  /**
   * Printer driver name
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  driverName: string;

  /**
   * File size in bytes (if available)
   */
  @Column({ type: 'bigint', default: 0 })
  fileSize: number;

  /**
   * When the print job was submitted to the spooler (agent time)
   */
  @Column({ type: 'timestamp' })
  @Index()
  timeSubmitted: Date;

  /**
   * When the agent detected this print job
   */
  @Column({ type: 'timestamp' })
  detectedAt: Date;

  /**
   * Timestamp when event was received by backend
   */
  @CreateDateColumn()
  receivedAt: Date;

  /**
   * Additional metadata and DLP analysis results
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    // DLP analysis
    containsSensitivePatterns?: boolean;
    detectedPatterns?: string[];
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    flagged?: boolean;
    flaggedReason?: string;
    
    // Document classification
    documentCategory?: 'FINANCIAL' | 'CONFIDENTIAL' | 'MEDICAL' | 'LEGAL' | 'PERSONAL' | 'BUSINESS' | 'OTHER';
    
    // Context information
    timeOfDay?: 'BUSINESS_HOURS' | 'AFTER_HOURS' | 'WEEKEND';
    location?: string; // Office location if available
    
    // Risk factors
    isPersonalPrinter?: boolean; // "Print to PDF", home printers
    largeDocument?: boolean; // > 50 pages
    unusualHours?: boolean; // Outside business hours
    
    // Additional info
    originalPayload?: any; // Store original agent payload for debugging
  };
}
