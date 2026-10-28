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
 * ClipboardEvent entity for tracking clipboard content changes
 * Used for security monitoring, data loss prevention, and compliance
 */
@Entity('clipboard_events')
@Index(['deviceId', 'capturedAt'])
@Index(['tenantId', 'capturedAt'])
@Index(['activeProcess'])
export class ClipboardEvent {
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
   * Clipboard text content (truncated to 2KB max)
   */
  @Column({ type: 'text' })
  content: string;

  /**
   * Original content length before truncation
   */
  @Column({ type: 'int' })
  contentLength: number;

  /**
   * Whether content was truncated
   */
  @Column({ type: 'boolean', default: false })
  truncated: boolean;

  /**
   * Active process name when clipboard content was captured
   */
  @Column({ type: 'varchar', length: 255 })
  @Index()
  activeProcess: string;

  /**
   * Timestamp when clipboard content was captured (agent time)
   */
  @Column({ type: 'timestamp' })
  @Index()
  capturedAt: Date;

  /**
   * Timestamp when event was received by backend
   */
  @CreateDateColumn()
  receivedAt: Date;

  /**
   * Additional metadata (optional)
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    containsSensitivePatterns?: boolean;
    detectedPatterns?: string[];
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    flagged?: boolean;
    flaggedReason?: string;
  };
}
