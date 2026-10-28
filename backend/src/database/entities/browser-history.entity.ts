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
 * BrowserHistoryEntry entity for tracking user browsing activity
 * Used for security monitoring, productivity analysis, and compliance
 */
@Entity('browser_history')
@Index(['deviceId', 'lastVisit'])
@Index(['tenantId', 'lastVisit'])
@Index(['browser'])
@Index(['url'])
export class BrowserHistoryEntry {
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
   * Browser name (Chrome, Edge, Firefox)
   */
  @Column({ type: 'varchar', length: 50 })
  @Index()
  browser: string;

  /**
   * Visited URL
   */
  @Column({ type: 'text' })
  url: string;

  /**
   * Page title
   */
  @Column({ type: 'text', nullable: true })
  title: string;

  /**
   * Number of times visited
   */
  @Column({ type: 'int', default: 1 })
  visitCount: number;

  /**
   * Last visit timestamp (from browser database)
   */
  @Column({ type: 'timestamp' })
  @Index()
  lastVisit: Date;

  /**
   * Timestamp when this entry was collected by agent
   */
  @Column({ type: 'timestamp' })
  collectedAt: Date;

  /**
   * Timestamp when received by backend
   */
  @CreateDateColumn()
  receivedAt: Date;

  /**
   * Additional metadata (optional)
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    domain?: string;
    category?: string;
    flagged?: boolean;
    flaggedReason?: string;
    productivityScore?: number;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}
