import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

/**
 * Network Connection Entity
 * Stores deep network connection telemetry with process enrichment,
 * geolocation, and threat intelligence
 */
@Entity('network_connections')
@Index(['agentId', 'capturedAt'])
@Index(['agentId', 'isThreatIp'])
@Index(['state'])
@Index(['protocol'])
@Index(['remoteAddress'])
@Index(['processName'])
@Index(['country'])
export class NetworkConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Agent UUID that reported this connection
   */
  @Column({ type: 'uuid' })
  @Index()
  agentId: string;

  /**
   * Protocol (TCP or UDP)
   */
  @Column({ type: 'varchar', length: 10 })
  protocol: string;

  /**
   * Local IP address (IPv4 or IPv6)
   */
  @Column({ type: 'varchar', length: 45 })
  localAddress: string;

  /**
   * Local port number
   */
  @Column({ type: 'int' })
  localPort: number;

  /**
   * Remote IP address (IPv4 or IPv6)
   */
  @Column({ type: 'varchar', length: 45, nullable: true })
  remoteAddress: string;

  /**
   * Remote port number
   */
  @Column({ type: 'int', nullable: true })
  remotePort: number;

  /**
   * Connection state (ESTABLISHED, LISTENING, TIME_WAIT, etc.)
   */
  @Column({ type: 'varchar', length: 20 })
  state: string;

  /**
   * Process ID
   */
  @Column({ type: 'int' })
  pid: number;

  /**
   * Process name (e.g., "chrome", "svchost")
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  processName: string;

  /**
   * Full process path
   */
  @Column({ type: 'text', nullable: true })
  processPath: string;

  /**
   * Geolocation: Country
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string;

  /**
   * Geolocation: City
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string;

  /**
   * Geolocation: ISP
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  isp: string;

  /**
   * Whether the remote IP is identified as a threat
   */
  @Column({ type: 'boolean', default: false })
  isThreatIp: boolean;

  /**
   * Reason why the IP is flagged as a threat
   */
  @Column({ type: 'text', nullable: true })
  threatReason: string;

  /**
   * When the connection was captured by the agent
   */
  @Column({ type: 'timestamp' })
  capturedAt: Date;

  /**
   * When the connection data was received by the backend
   */
  @CreateDateColumn({ type: 'timestamp' })
  receivedAt: Date;
}
