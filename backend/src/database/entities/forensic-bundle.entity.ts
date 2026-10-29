import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * ForensicBundle Entity
 * 
 * Tracks forensic diagnostic bundles collected from devices for
 * incident response, compliance audits, and troubleshooting.
 * 
 * A forensic bundle is a comprehensive snapshot of device state including:
 * - Running processes and services
 * - Network connections
 * - Installed applications
 * - System logs and event logs
 * - Registry entries (Windows) or persistence mechanisms
 * - File system artifacts
 * - Memory dumps (optional)
 * - Hardware configuration
 * 
 * These bundles are typically encrypted and stored for legal/compliance purposes.
 */
@Entity('forensic_bundles')
@Index(['deviceId', 'collectedAt'])
@Index(['bundleType'])
@Index(['status'])
export class ForensicBundle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Device from which the bundle was collected
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
   * Type of forensic bundle
   * DIAGNOSTIC: Standard troubleshooting bundle
   * SECURITY_INCIDENT: Collected during security investigation
   * COMPLIANCE_AUDIT: For regulatory compliance
   * LEGAL_HOLD: Legal preservation of evidence
   * FULL_FORENSIC: Complete device image (rare)
   */
  @Column({
    name: 'bundle_type',
    type: 'enum',
    enum: ['DIAGNOSTIC', 'SECURITY_INCIDENT', 'COMPLIANCE_AUDIT', 'LEGAL_HOLD', 'FULL_FORENSIC'],
    default: 'DIAGNOSTIC',
  })
  bundleType: 'DIAGNOSTIC' | 'SECURITY_INCIDENT' | 'COMPLIANCE_AUDIT' | 'LEGAL_HOLD' | 'FULL_FORENSIC';

  /**
   * Status of the bundle collection/upload
   */
  @Column({
    name: 'status',
    type: 'enum',
    enum: ['PENDING', 'COLLECTING', 'COLLECTED', 'UPLOADING', 'UPLOADED', 'FAILED', 'DELETED'],
    default: 'PENDING',
  })
  status: 'PENDING' | 'COLLECTING' | 'COLLECTED' | 'UPLOADING' | 'UPLOADED' | 'FAILED' | 'DELETED';

  /**
   * Size of the bundle in bytes
   */
  @Column({ name: 'size_bytes', type: 'bigint', nullable: true })
  sizeBytes?: number;

  /**
   * Number of artifacts/files in the bundle
   */
  @Column({ name: 'artifact_count', type: 'integer', default: 0 })
  artifactCount: number;

  /**
   * When the bundle was collected on the device (agent timestamp)
   */
  @Column({ name: 'collected_at', type: 'timestamp', nullable: true })
  collectedAt?: Date;

  /**
   * When the bundle finished uploading to storage (server timestamp)
   */
  @Column({ name: 'uploaded_at', type: 'timestamp', nullable: true })
  uploadedAt?: Date;

  /**
   * Storage location (S3 URL, Azure Blob URL, etc.)
   * Should be encrypted and access-controlled
   */
  @Column({ name: 'storage_url', type: 'text', nullable: true })
  storageUrl?: string;

  /**
   * SHA-256 hash of the bundle for integrity verification
   */
  @Column({ name: 'sha256_hash', type: 'varchar', length: 64, nullable: true })
  sha256Hash?: string;

  /**
   * Whether the bundle is encrypted
   */
  @Column({ name: 'is_encrypted', type: 'boolean', default: true })
  isEncrypted: boolean;

  /**
   * Encryption key ID (reference to key management system)
   * Never store the actual encryption key in the database
   */
  @Column({ name: 'encryption_key_id', type: 'varchar', length: 255, nullable: true })
  encryptionKeyId?: string;

  /**
   * User who requested the bundle collection
   */
  @Column({ name: 'requested_by', type: 'varchar', length: 255, nullable: true })
  requestedBy?: string;

  /**
   * Remote action ID that triggered this bundle collection
   */
  @Column({ name: 'remote_action_id', type: 'uuid', nullable: true })
  remoteActionId?: string;

  /**
   * Reason for collecting the bundle
   */
  @Column({ name: 'collection_reason', type: 'text', nullable: true })
  collectionReason?: string;

  /**
   * Retention policy for the bundle (days)
   * After this period, bundle should be deleted for compliance
   */
  @Column({ name: 'retention_days', type: 'integer', default: 90 })
  retentionDays: number;

  /**
   * When the bundle will be automatically deleted
   */
  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt?: Date;

  /**
   * Detailed manifest of what's included in the bundle
   * Example: {
   *   processes: 45,
   *   networkConnections: 23,
   *   installedApps: 67,
   *   eventLogs: 1520,
   *   registryKeys: 340,
   *   files: 12
   * }
   */
  @Column({ name: 'manifest', type: 'jsonb', nullable: true })
  manifest?: Record<string, any>;

  /**
   * Additional metadata about the collection
   * Can include: OS version, agent version, collection method, errors, etc.
   */
  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  /**
   * When the record was created in the database
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * When the record was last updated
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
