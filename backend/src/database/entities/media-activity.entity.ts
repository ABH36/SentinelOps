import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn } from 'typeorm';

/**
 * Media Activity Entity
 * 
 * Stores microphone and camera usage activity from Windows agents.
 * Tracks which applications are actively using audio capture devices (microphones)
 * and camera devices (webcams) for privacy and security monitoring.
 * 
 * Security Use Cases:
 * - Unauthorized microphone access detection (spyware, malware)
 * - Unauthorized camera access detection (surveillance malware)
 * - Privacy compliance monitoring (GDPR, CCPA)
 * - Data exfiltration via audio/video recording
 * - Meeting/call monitoring for corporate policy enforcement
 * - Insider threat detection (recording sensitive conversations)
 * 
 * Performance:
 * - Indexed on agentId for per-device queries
 * - Indexed on detectedAt for time-range queries
 * - Indexed on deviceType for microphone/camera filtering
 * - Composite index on processName + agentId for app tracking
 */
@Entity('media_activities')
@Index(['agentId'])
@Index(['detectedAt'])
@Index(['deviceType'])
@Index(['processName', 'agentId'])
@Index(['isActive'])
export class MediaActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Agent identifier (device ID from enrollment)
   */
  @Column()
  @Index()
  agentId: string;

  /**
   * Device type: "Microphone" or "Camera"
   */
  @Column({ length: 20 })
  deviceType: string;

  /**
   * Process ID using the device (0 if not available)
   */
  @Column({ type: 'int', default: 0 })
  processId: number;

  /**
   * Process name using the device
   */
  @Column({ length: 255 })
  processName: string;

  /**
   * Full path to process executable
   */
  @Column({ type: 'text', nullable: true })
  processPath: string | null;

  /**
   * App package name (for UWP apps)
   * Format examples:
   * - UWP: "Microsoft.WindowsCamera_8wekyb3d8bbwe"
   * - NonPackaged: "C:#Users#Username#AppData#Local#Program#app.exe"
   */
  @Column({ type: 'text', nullable: true })
  appPackageName: string | null;

  /**
   * Whether device is currently active (true) or stopped (false)
   */
  @Column({ default: true })
  isActive: boolean;

  /**
   * Security risk assessment
   * - AUTHORIZED: Known/approved application
   * - UNAUTHORIZED: Unapproved application accessing device
   * - SUSPICIOUS: Known malware/spyware pattern
   * - UNKNOWN: Cannot determine risk level
   */
  @Column({ length: 20, default: 'UNKNOWN' })
  riskLevel: string;

  /**
   * Whether application is authorized to access this device
   */
  @Column({ default: true })
  isAuthorized: boolean;

  /**
   * Whether activity is flagged as suspicious
   */
  @Column({ default: false })
  isSuspicious: boolean;

  /**
   * Security threats detected (JSON array)
   * Examples: ["UNAUTHORIZED_ACCESS", "BACKGROUND_RECORDING", "UNKNOWN_PROCESS", "SUSPICIOUS_PATTERN"]
   */
  @Column({ type: 'simple-json', nullable: true })
  threats: string[] | null;

  /**
   * When activity started (from registry timestamp for camera, or detection time for microphone)
   */
  @Column({ type: 'timestamp', nullable: true })
  activeSince: Date | null;

  /**
   * When activity stopped (null if still active)
   */
  @Column({ type: 'timestamp', nullable: true })
  stoppedAt: Date | null;

  /**
   * Duration of activity in seconds (calculated when stopped)
   */
  @Column({ type: 'int', nullable: true })
  durationSeconds: number | null;

  /**
   * Timestamp when activity was detected/changed
   */
  @Column({ type: 'timestamp' })
  @Index()
  detectedAt: Date;

  /**
   * Timestamp when activity was received by backend
   */
  @CreateDateColumn()
  receivedAt: Date;
}
