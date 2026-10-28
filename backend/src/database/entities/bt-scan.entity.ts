import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn } from 'typeorm';

/**
 * Bluetooth Scan Entity
 * 
 * Stores Bluetooth device scan results from Windows agents.
 * Tracks nearby Bluetooth devices including name, address, device type,
 * class of device, paired status, and signal strength.
 * 
 * Security Use Cases:
 * - Unauthorized Bluetooth device detection
 * - Rogue device monitoring (BlueBorne, BlueBugs attacks)
 * - Data exfiltration via Bluetooth (file transfers)
 * - Bluetooth beacon tracking (privacy concerns)
 * - Compliance verification (Bluetooth disabled in secure zones)
 * - Device pairing monitoring
 * 
 * Performance:
 * - Indexed on agentId for per-device queries
 * - Indexed on scannedAt for time-range queries
 * - Indexed on address for device-specific searches
 * - Composite index on address + agentId for device tracking
 */
@Entity('bluetooth_scans')
@Index(['agentId'])
@Index(['scannedAt'])
@Index(['address'])
@Index(['address', 'agentId'])
@Index(['deviceType'])
@Index(['isPaired'])
export class BluetoothScan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Agent identifier (device ID from enrollment)
   */
  @Column()
  @Index()
  agentId: string;

  /**
   * Device name (friendly name)
   */
  @Column({ length: 255 })
  name: string;

  /**
   * Bluetooth MAC address in format "AA:BB:CC:DD:EE:FF"
   */
  @Column({ length: 17 })
  address: string;

  /**
   * Windows device ID (null for BLE advertisement-only devices)
   */
  @Column({ type: 'text', nullable: true })
  deviceId: string | null;

  /**
   * Device type: "Classic" or "BLE" (Bluetooth Low Energy)
   */
  @Column({ length: 20 })
  deviceType: string;

  /**
   * Class of Device (COD) description
   * Examples:
   * - "Phone"
   * - "Computer"
   * - "Audio/Video - Headset"
   * - "Audio/Video - Headphones"
   * - "Audio/Video - Speaker"
   * - "Peripheral"
   * - "Wearable"
   * - "Health Device"
   */
  @Column({ length: 100, nullable: true })
  classOfDevice: string | null;

  /**
   * Whether device is paired with this computer
   */
  @Column({ default: false })
  isPaired: boolean;

  /**
   * Whether device is currently connected
   */
  @Column({ default: false })
  isConnected: boolean;

  /**
   * RSSI (Received Signal Strength Indicator) in dBm
   * Available for BLE devices, null for classic Bluetooth
   * Typically ranges from -90 (far) to -30 (near)
   */
  @Column({ type: 'int', nullable: true })
  rssi: number | null;

  /**
   * Security risk assessment
   * - AUTHORIZED: Known/paired device
   * - UNAUTHORIZED: Unknown device in proximity
   * - SUSPICIOUS: High-risk device type or behavior
   * - UNKNOWN: Cannot determine risk level
   */
  @Column({ length: 20, default: 'UNKNOWN' })
  riskLevel: string;

  /**
   * Whether device is authorized by policy
   */
  @Column({ default: true })
  isAuthorized: boolean;

  /**
   * Whether device is flagged as suspicious
   */
  @Column({ default: false })
  isSuspicious: boolean;

  /**
   * Security threats detected (JSON array)
   * Examples: ["UNKNOWN_DEVICE", "DATA_TRANSFER_RISK", "UNAUTHORIZED_PAIRING", "BEACON_TRACKING"]
   */
  @Column({ type: 'simple-json', nullable: true })
  threats: string[] | null;

  /**
   * Last time device was seen during scan
   */
  @Column({ type: 'timestamp' })
  lastSeen: Date;

  /**
   * Timestamp when device was first detected in this scan
   */
  @Column({ type: 'timestamp' })
  detectedAt: Date;

  /**
   * Timestamp when scan was performed on agent
   */
  @Column({ type: 'timestamp' })
  @Index()
  scannedAt: Date;

  /**
   * Timestamp when scan results were received by backend
   */
  @CreateDateColumn()
  receivedAt: Date;
}
