import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn } from 'typeorm';

/**
 * USB Event Entity
 * 
 * Stores USB device connection/disconnection events from Windows agents.
 * Tracks device insertion and removal with full device information including
 * VID/PID, device type classification, and manufacturer details.
 * 
 * Security Features:
 * - Tracks unauthorized USB device connections
 * - Device whitelist/blacklist enforcement
 * - Data exfiltration risk monitoring
 * - Device type classification for policy enforcement
 * 
 * Performance:
 * - Indexed on agentId for per-device queries
 * - Indexed on detectedAt for time-range queries
 * - Indexed on eventType for connection/disconnection analysis
 * - Composite index on deviceId + agentId for device tracking
 */
@Entity('usb_events')
@Index(['agentId'])
@Index(['detectedAt'])
@Index(['eventType'])
@Index(['deviceId', 'agentId'])
@Index(['deviceType'])
@Index(['vendorId', 'productId'])
export class UsbEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Agent identifier (device ID from enrollment)
   */
  @Column()
  @Index()
  agentId: string;

  /**
   * Event type: "INSERTED" or "REMOVED"
   */
  @Column({ length: 20 })
  eventType: string;

  /**
   * Device name (friendly name from Windows)
   */
  @Column({ length: 500 })
  deviceName: string;

  /**
   * Device ID (Windows PnP device identifier)
   */
  @Column({ length: 500 })
  deviceId: string;

  /**
   * Device description
   */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * Device manufacturer
   */
  @Column({ length: 200, nullable: true })
  manufacturer: string | null;

  /**
   * Vendor ID (VID) - hexadecimal identifier
   */
  @Column({ length: 10, nullable: true })
  vendorId: string | null;

  /**
   * Product ID (PID) - hexadecimal identifier
   */
  @Column({ length: 10, nullable: true })
  productId: string | null;

  /**
   * Device serial number
   */
  @Column({ length: 200, nullable: true })
  serialNumber: string | null;

  /**
   * Device type classification:
   * - STORAGE: USB flash drives, external hard drives
   * - KEYBOARD: USB keyboards
   * - MOUSE: USB mice, pointing devices
   * - PRINTER: USB printers
   * - CAMERA: Webcams, digital cameras
   * - AUDIO: Headsets, speakers, microphones
   * - NETWORK: USB network adapters
   * - SERIAL: Serial/COM port devices
   * - HID: Human Interface Devices (generic)
   * - UNKNOWN: Unclassified devices
   */
  @Column({ length: 50 })
  deviceType: string;

  /**
   * Device status from Windows
   */
  @Column({ length: 50, nullable: true })
  status: string | null;

  /**
   * Security risk assessment
   * - AUTHORIZED: Device is on whitelist
   * - UNAUTHORIZED: Device violates policy
   * - UNKNOWN: No policy defined
   * - SUSPICIOUS: High-risk device type or behavior
   */
  @Column({ length: 20, default: 'UNKNOWN' })
  riskLevel: string;

  /**
   * Whether device is authorized by policy
   */
  @Column({ default: false })
  isAuthorized: boolean;

  /**
   * Whether device is blocked by policy
   */
  @Column({ default: false })
  isBlocked: boolean;

  /**
   * Policy rule ID that matched (if any)
   */
  @Column({ length: 100, nullable: true })
  matchedPolicyId: string | null;

  /**
   * Security threats detected (JSON array)
   * Examples: ["DATA_EXFILTRATION_RISK", "UNAUTHORIZED_STORAGE", "UNKNOWN_VENDOR"]
   */
  @Column({ type: 'simple-json', nullable: true })
  threats: string[] | null;

  /**
   * Timestamp when event was detected on agent
   */
  @Column({ type: 'timestamp' })
  @Index()
  detectedAt: Date;

  /**
   * Timestamp when event was received by backend
   */
  @CreateDateColumn()
  receivedAt: Date;
}
