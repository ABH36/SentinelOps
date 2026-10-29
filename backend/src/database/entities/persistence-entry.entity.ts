import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn } from 'typeorm';

/**
 * Persistence Entry Entity
 * 
 * Stores Windows persistence mechanism entries detected by agents.
 * Tracks Registry autorun keys, Startup folders, Windows Services, and Scheduled Tasks.
 * 
 * Persistence Types:
 * - Registry: Run/RunOnce keys in HKLM and HKCU
 * - Startup Folder: Files in system and user startup folders
 * - Service: Windows services with automatic start mode
 * - Scheduled Task: Tasks configured to run automatically
 * 
 * Threat Detection:
 * - SUSPICIOUS_PATH: Files in temp/downloads folders
 * - SUSPICIOUS_EXTENSION: Script files (.vbs, .js, .ps1, .bat)
 * - FILE_NOT_FOUND: Referenced file doesn't exist
 * - ENCODED_POWERSHELL: Obfuscated PowerShell commands
 * - SCRIPT_EXECUTION: wscript/cscript usage
 * - DLL_EXECUTION: regsvr32/rundll32 usage
 * - REMOTE_DOWNLOAD: HTTP/HTTPS URLs in commands
 * - SYSTEM_ACCOUNT_SERVICE: Services running as LocalSystem
 * 
 * Use Cases:
 * - Malware persistence detection
 * - Unauthorized software installation tracking
 * - Compliance monitoring (approved software only)
 * - Incident response and forensics
 * - Change auditing for critical systems
 * - Baseline deviation detection
 * 
 * Performance:
 * - Indexed on agentId for per-device queries
 * - Indexed on type for filtering by persistence mechanism
 * - Indexed on changeType for change tracking
 * - Indexed on isSuspicious for threat prioritization
 * - Composite index on agentId + type for targeted queries
 */
@Entity('persistence_entries')
@Index(['agentId'])
@Index(['type'])
@Index(['changeType'])
@Index(['isSuspicious'])
@Index(['agentId', 'type'])
@Index(['riskLevel'])
@Index(['fileHash'])
export class PersistenceEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Agent identifier (device ID from enrollment)
   */
  @Column()
  @Index()
  agentId: string;

  /**
   * Persistence mechanism type
   * Values: "Registry", "Startup Folder", "Service", "Scheduled Task"
   */
  @Column({ length: 50 })
  type: string;

  /**
   * Location of persistence entry
   * - Registry: Full registry path (e.g., HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run)
   * - Startup Folder: Folder path
   * - Service: "Services"
   * - Scheduled Task: "Task Scheduler"
   */
  @Column({ length: 500 })
  location: string;

  /**
   * Entry name
   * - Registry: Value name
   * - Startup Folder: File name
   * - Service: Service name
   * - Scheduled Task: Task name
   */
  @Column({ length: 255 })
  name: string;

  /**
   * Display name (for services)
   */
  @Column({ length: 255, nullable: true })
  displayName: string | null;

  /**
   * Full command line or value
   */
  @Column({ type: 'text' })
  command: string;

  /**
   * Extracted executable file path
   */
  @Column({ length: 500, nullable: true })
  filePath: string | null;

  /**
   * SHA256 hash of the executable file
   */
  @Column({ length: 64, nullable: true })
  @Index()
  fileHash: string | null;

  /**
   * Service start mode (for services)
   * Values: "Auto", "Automatic", "Manual", "Disabled"
   */
  @Column({ length: 50, nullable: true })
  startMode: string | null;

  /**
   * Service state (for services)
   * Values: "Running", "Stopped", "Paused"
   */
  @Column({ length: 50, nullable: true })
  serviceState: string | null;

  /**
   * Service account (for services)
   * Examples: "LocalSystem", "NT AUTHORITY\\NetworkService", "LocalService"
   */
  @Column({ length: 255, nullable: true })
  serviceAccount: string | null;

  /**
   * Scheduled task status (for tasks)
   * Values: "Ready", "Running", "Disabled", "Queued"
   */
  @Column({ length: 50, nullable: true })
  taskStatus: string | null;

  /**
   * Scheduled task author (for tasks)
   */
  @Column({ length: 255, nullable: true })
  taskAuthor: string | null;

  /**
   * Detected threats (JSON array)
   * Examples: ["SUSPICIOUS_PATH", "ENCODED_POWERSHELL", "REMOTE_DOWNLOAD"]
   */
  @Column({ type: 'simple-json', nullable: true })
  threats: string[] | null;

  /**
   * Numeric risk score (0-10)
   * Calculated from threat indicators
   */
  @Column({ type: 'int', default: 0 })
  riskScore: number;

  /**
   * Risk level classification
   * Values: "NONE", "LOW", "MEDIUM", "HIGH"
   */
  @Column({ length: 20, default: 'NONE' })
  @Index()
  riskLevel: string;

  /**
   * Whether entry is flagged as suspicious
   */
  @Column({ default: false })
  @Index()
  isSuspicious: boolean;

  /**
   * Change type for incremental reporting
   * Values: "ADDED", "MODIFIED", "REMOVED", "" (initial scan)
   */
  @Column({ length: 20, default: '' })
  @Index()
  changeType: string;

  /**
   * Timestamp when entry was scanned on the agent
   */
  @Column({ type: 'timestamp' })
  scannedAt: Date;

  /**
   * Timestamp when entry was received by backend
   */
  @CreateDateColumn()
  receivedAt: Date;
}
