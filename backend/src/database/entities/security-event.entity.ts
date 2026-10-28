import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn } from 'typeorm';

/**
 * Security Event Entity
 * 
 * Stores critical Windows Security Event Log entries collected from Windows agents.
 * Monitors authentication events, privilege escalations, user/group modifications,
 * process creation, scheduled tasks, PowerShell activity, and service installations.
 * 
 * Monitored Event IDs:
 * - 4624: Successful logon
 * - 4625: Failed logon attempt
 * - 4648: Logon with explicit credentials (RunAs)
 * - 4672: Special privileges assigned to new logon
 * - 4720: User account created
 * - 4732: Member added to security-enabled local group
 * - 4688: New process created
 * - 4698: Scheduled task created
 * - 4104: PowerShell script block logging
 * - 7045: Service installed in system
 * 
 * Security Use Cases:
 * - Brute force attack detection (multiple 4625 events)
 * - Privilege escalation monitoring (4672, 4732)
 * - Lateral movement detection (4648)
 * - Malicious process creation tracking (4688)
 * - Persistence mechanism detection (4698, 7045)
 * - PowerShell-based attacks (4104)
 * - Unauthorized account creation (4720)
 * - Compliance auditing (SOC 2, PCI DSS, HIPAA)
 * - Insider threat detection
 * - Incident response and forensics
 * 
 * Performance:
 * - Indexed on agentId for per-device queries
 * - Indexed on eventTimestamp for time-range queries
 * - Indexed on eventId for event-type filtering
 * - Composite index on agentId + eventId for targeted queries
 * - Indexed on riskLevel for threat prioritization
 */
@Entity('security_events')
@Index(['agentId'])
@Index(['eventTimestamp'])
@Index(['eventId'])
@Index(['agentId', 'eventId'])
@Index(['riskLevel'])
@Index(['username'])
export class SecurityEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Agent identifier (device ID from enrollment)
   */
  @Column()
  @Index()
  agentId: string;

  /**
   * Windows Event ID
   * Examples: 4624, 4625, 4648, 4672, 4720, 4732, 4688, 4698, 4104, 7045
   */
  @Column({ type: 'int' })
  eventId: number;

  /**
   * Human-readable event type description
   * Examples: "Successful Logon", "Failed Logon Attempt", "Process Created"
   */
  @Column({ length: 255 })
  eventType: string;

  /**
   * Event Record ID from Windows Event Log
   */
  @Column({ type: 'bigint', default: 0 })
  recordId: number;

  /**
   * Event level: Critical, Error, Warning, Information, Verbose
   */
  @Column({ length: 20, default: 'Information' })
  level: string;

  /**
   * Computer/hostname where event occurred
   */
  @Column({ length: 255 })
  computer: string;

  /**
   * Username associated with the event (if applicable)
   * Could be subject username, target username, or account name
   */
  @Column({ length: 255, nullable: true })
  @Index()
  username: string | null;

  /**
   * Domain associated with the event
   */
  @Column({ length: 255, nullable: true })
  domain: string | null;

  /**
   * Process name involved in the event (for 4688, 4648)
   */
  @Column({ length: 500, nullable: true })
  processName: string | null;

  /**
   * Process ID (for 4688)
   */
  @Column({ type: 'int', nullable: true })
  processId: number | null;

  /**
   * Command line used to launch process (for 4688)
   * Truncated to 2000 chars to prevent huge payloads
   */
  @Column({ type: 'text', nullable: true })
  commandLine: string | null;

  /**
   * Source IP address (for logon events 4624, 4625)
   */
  @Column({ length: 50, nullable: true })
  sourceIp: string | null;

  /**
   * Logon type (for 4624, 4625)
   * 2 = Interactive, 3 = Network, 10 = RemoteInteractive (RDP), etc.
   */
  @Column({ length: 20, nullable: true })
  logonType: string | null;

  /**
   * Workstation name (for logon events)
   */
  @Column({ length: 255, nullable: true })
  workstation: string | null;

  /**
   * Target username (for 4648, 4720, 4732)
   */
  @Column({ length: 255, nullable: true })
  targetUsername: string | null;

  /**
   * Group name (for 4732)
   */
  @Column({ length: 255, nullable: true })
  groupName: string | null;

  /**
   * Member name added to group (for 4732)
   */
  @Column({ length: 255, nullable: true })
  memberName: string | null;

  /**
   * Task name (for 4698 scheduled task)
   */
  @Column({ length: 500, nullable: true })
  taskName: string | null;

  /**
   * Service name (for 7045 service installation)
   */
  @Column({ length: 255, nullable: true })
  serviceName: string | null;

  /**
   * Service image path (for 7045)
   */
  @Column({ type: 'text', nullable: true })
  imagePath: string | null;

  /**
   * Service account name (for 7045)
   */
  @Column({ length: 255, nullable: true })
  accountName: string | null;

  /**
   * PowerShell script block content (for 4104)
   * Truncated to 1000 chars to prevent huge payloads
   */
  @Column({ type: 'text', nullable: true })
  scriptBlock: string | null;

  /**
   * Full event description from Windows Event Log
   * Can be large, stored as text
   */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * Raw event properties as JSON
   * Contains all Data_X fields from EventRecord
   */
  @Column({ type: 'simple-json', nullable: true })
  properties: Record<string, string> | null;

  /**
   * Security risk assessment
   * - LOW: Normal activity
   * - MEDIUM: Potentially suspicious (e.g., unusual logon time)
   * - HIGH: Suspicious activity (e.g., privilege escalation)
   * - CRITICAL: Known attack pattern (e.g., mimikatz, psexec)
   */
  @Column({ length: 20, default: 'LOW' })
  @Index()
  riskLevel: string;

  /**
   * Whether event is flagged as suspicious
   */
  @Column({ default: false })
  isFlagged: boolean;

  /**
   * Threat indicators detected (JSON array)
   * Examples: ["BRUTE_FORCE_ATTEMPT", "PRIVILEGE_ESCALATION", "LATERAL_MOVEMENT",
   *            "PERSISTENCE_MECHANISM", "SUSPICIOUS_POWERSHELL", "MALICIOUS_PROCESS"]
   */
  @Column({ type: 'simple-json', nullable: true })
  threats: string[] | null;

  /**
   * Original event timestamp from Windows Event Log
   */
  @Column({ type: 'timestamp' })
  @Index()
  eventTimestamp: Date;

  /**
   * Timestamp when event was collected by agent
   */
  @Column({ type: 'timestamp' })
  collectedAt: Date;

  /**
   * Timestamp when event was received by backend
   */
  @CreateDateColumn()
  receivedAt: Date;
}
