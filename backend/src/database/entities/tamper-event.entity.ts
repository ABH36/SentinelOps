import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * TamperEvent Entity
 * 
 * Tracks anti-tamper violations and security events detected by
 * the agent's self-protection mechanisms.
 * 
 * Events include:
 * - Root/jailbreak detection
 * - App signature tampering
 * - Debugger attachment
 * - Memory manipulation attempts
 * - Process injection
 * - SafetyNet/Play Integrity failures
 * - Module/library injection
 * - Frida/Xposed detection
 */
@Entity('tamper_events')
@Index(['deviceId', 'detectedAt'])
@Index(['severity', 'detectedAt'])
@Index(['eventType'])
export class TamperEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Device that detected the tampering
   */
  @Column({ name: 'device_id', type: 'varchar', length: 255 })
  @Index()
  deviceId: string;

  /**
   * Tenant ID for multi-tenancy
   */
  @Column({ name: 'tenant_id', type: 'varchar', length: 255 })
  @Index()
  tenantId: string;

  /**
   * Type of tampering detected
   * Examples: 'ROOT_DETECTED', 'SIGNATURE_INVALID', 'DEBUGGER_ATTACHED',
   * 'FRIDA_DETECTED', 'XPOSED_DETECTED', 'SAFETYNET_FAILED'
   */
  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  /**
   * Severity level of the tamper event
   * LOW: Suspicious but not critical
   * MEDIUM: Likely tampering, monitoring needed
   * HIGH: Confirmed tampering, immediate action required
   * CRITICAL: Severe compromise, device should be isolated
   */
  @Column({
    name: 'severity',
    type: 'enum',
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM',
  })
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  /**
   * Human-readable description of the tamper event
   */
  @Column({ name: 'description', type: 'text' })
  description: string;

  /**
   * Indicators that triggered the detection
   * Array of specific evidence/indicators
   */
  @Column({ name: 'indicators', type: 'jsonb', nullable: true })
  indicators?: string[];

  /**
   * Recommended actions to take
   * Examples: 'ISOLATE_DEVICE', 'ALERT_ADMIN', 'WIPE_DEVICE', 'MONITOR'
   */
  @Column({ name: 'recommended_actions', type: 'jsonb', nullable: true })
  recommendedActions?: string[];

  /**
   * Whether the device was automatically remediated
   */
  @Column({ name: 'auto_remediated', type: 'boolean', default: false })
  autoRemediated: boolean;

  /**
   * Remediation action taken (if any)
   * Examples: 'LOCKED', 'NETWORK_ISOLATED', 'WIPED', 'ALERT_SENT'
   */
  @Column({ name: 'remediation_action', type: 'varchar', length: 100, nullable: true })
  remediationAction?: string;

  /**
   * When the tampering was detected (agent timestamp)
   */
  @Column({ name: 'detected_at', type: 'timestamp' })
  detectedAt: Date;

  /**
   * Additional metadata about the event
   * Can include: rootMethod, rootPackages, debuggerPid, etc.
   */
  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  /**
   * When the event was created in the database (server timestamp)
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * When the event was last updated
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
