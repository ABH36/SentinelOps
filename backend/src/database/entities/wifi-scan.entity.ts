import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn } from 'typeorm';

/**
 * Wi-Fi Scan Entity
 * 
 * Stores Wi-Fi network scan results from Windows agents.
 * Tracks available wireless networks including SSID, BSSID, signal strength,
 * security configuration, and channel information.
 * 
 * Security Use Cases:
 * - Rogue Access Point (AP) detection
 * - Evil Twin AP detection (fake APs mimicking legitimate networks)
 * - Open/weak security detection (WEP, open networks)
 * - Unauthorized network monitoring
 * - Compliance verification (approved networks only)
 * - Network reconnaissance detection
 * 
 * Performance:
 * - Indexed on agentId for per-device queries
 * - Indexed on scannedAt for time-range queries
 * - Indexed on ssid for network-specific searches
 * - Composite index on bssid + agentId for AP tracking
 */
@Entity('wifi_scans')
@Index(['agentId'])
@Index(['scannedAt'])
@Index(['ssid'])
@Index(['bssid', 'agentId'])
@Index(['securityType'])
@Index(['isConnected'])
export class WifiScan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Agent identifier (device ID from enrollment)
   */
  @Column()
  @Index()
  agentId: string;

  /**
   * Network SSID (Service Set Identifier)
   */
  @Column({ length: 255 })
  ssid: string;

  /**
   * BSSID (MAC address of access point) in format "AA:BB:CC:DD:EE:FF"
   * Null if not available from scan
   */
  @Column({ length: 17, nullable: true })
  bssid: string | null;

  /**
   * Signal quality (0-100 percentage)
   */
  @Column({ type: 'int' })
  signalQuality: number;

  /**
   * RSSI (Received Signal Strength Indicator) in dBm
   * Typically ranges from -90 (weak) to -30 (strong)
   */
  @Column({ type: 'int', nullable: true })
  rssi: number | null;

  /**
   * Wi-Fi channel number (1-14 for 2.4GHz, 36-165 for 5GHz)
   */
  @Column({ type: 'int', nullable: true })
  channel: number | null;

  /**
   * Frequency in kHz (e.g., 2412000 = 2.412 GHz)
   */
  @Column({ type: 'int', nullable: true })
  frequency: number | null;

  /**
   * Security type:
   * - Open: No encryption
   * - WEP: Weak encryption (deprecated)
   * - WPA: Wi-Fi Protected Access
   * - WPA-PSK: WPA with Pre-Shared Key
   * - WPA2: WPA version 2
   * - WPA2-PSK: WPA2 with Pre-Shared Key
   * - WPA3: Latest WPA version (most secure)
   * - WPA3-SAE: WPA3 with Simultaneous Authentication of Equals
   */
  @Column({ length: 50 })
  securityType: string;

  /**
   * Whether this network is currently connected
   */
  @Column({ default: false })
  isConnected: boolean;

  /**
   * Network type (infrastructure, ad-hoc, etc.)
   */
  @Column({ length: 50, nullable: true })
  networkType: string | null;

  /**
   * Security risk assessment
   * - SECURE: WPA2/WPA3 encryption
   * - WEAK: WEP encryption
   * - OPEN: No encryption (high risk)
   * - ROGUE: Unauthorized AP detected
   * - EVIL_TWIN: Suspicious AP mimicking legitimate network
   * - UNKNOWN: Cannot determine security level
   */
  @Column({ length: 20, default: 'UNKNOWN' })
  riskLevel: string;

  /**
   * Whether network is authorized by policy
   */
  @Column({ default: true })
  isAuthorized: boolean;

  /**
   * Whether network is flagged as rogue/suspicious
   */
  @Column({ default: false })
  isRogue: boolean;

  /**
   * Security threats detected (JSON array)
   * Examples: ["OPEN_NETWORK", "WEAK_ENCRYPTION", "ROGUE_AP", "EVIL_TWIN", "UNKNOWN_SSID"]
   */
  @Column({ type: 'simple-json', nullable: true })
  threats: string[] | null;

  /**
   * Timestamp when network was detected during scan
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
