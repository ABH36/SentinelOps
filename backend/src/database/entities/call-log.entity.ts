import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

/**
 * Call Log Entity
 * 
 * Stores call metadata from Android devices with privacy protection.
 * Phone numbers are SHA-256 hashed before transmission.
 * 
 * PRIVACY COMPLIANCE:
 * - No actual phone numbers stored (only SHA-256 hashes)
 * - No call content or audio
 * - Metadata only for compliance and security monitoring
 */
@Entity('call_logs')
@Index(['agentId', 'timestamp'])
@Index(['callType'])
@Index(['phoneNumberHash'])
export class CallLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Agent UUID that reported this call log entry
   */
  @Column({ type: 'uuid' })
  @Index()
  agentId: string;

  /**
   * SHA-256 hash of the phone number
   * Original number is never transmitted or stored
   */
  @Column({ type: 'varchar', length: 64 })
  phoneNumberHash: string;

  /**
   * Type of call: INCOMING, OUTGOING, MISSED, VOICEMAIL, REJECTED, BLOCKED, ANSWERED_EXTERNALLY
   */
  @Column({ type: 'varchar', length: 30 })
  callType: string;

  /**
   * Call duration in seconds
   * 0 for missed/rejected calls
   */
  @Column({ type: 'int' })
  duration: number;

  /**
   * Whether a contact name was available in the device's address book
   * The actual name is not transmitted for privacy
   */
  @Column({ type: 'boolean', default: false })
  cachedNameAvailable: boolean;

  /**
   * Type of number (mobile, home, work, etc.) from device contacts
   * Numeric code from Android CallLog.Calls.CACHED_NUMBER_TYPE
   */
  @Column({ type: 'int', nullable: true })
  numberType: number;

  /**
   * Whether the call log entry was marked as read on the device
   */
  @Column({ type: 'boolean', default: true })
  isRead: boolean;

  /**
   * When the call occurred (timestamp from device)
   */
  @Column({ type: 'timestamp' })
  timestamp: Date;

  /**
   * When the call log entry was received by the backend
   */
  @CreateDateColumn({ type: 'timestamp' })
  receivedAt: Date;
}
