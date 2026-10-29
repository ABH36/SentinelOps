import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

/**
 * SMS Metadata Entity
 * 
 * Stores SMS/MMS metadata from Android devices with strict privacy protection.
 * Phone numbers are SHA-256 hashed before transmission.
 * 
 * CRITICAL PRIVACY NOTICE:
 * - NO message content (body) is ever collected or stored
 * - Only metadata (sender/recipient hash, type, timestamp, thread ID)
 * - Phone numbers are SHA-256 hashed (original numbers never transmitted)
 * - Complies with GDPR/CCPA metadata collection requirements
 */
@Entity('sms_metadata')
@Index(['agentId', 'timestamp'])
@Index(['smsType'])
@Index(['phoneNumberHash'])
@Index(['threadId'])
export class SmsMetadata {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Agent UUID that reported this SMS metadata entry
   */
  @Column({ type: 'uuid' })
  @Index()
  agentId: string;

  /**
   * SHA-256 hash of the phone number/address
   * Original number is never transmitted or stored
   */
  @Column({ type: 'varchar', length: 64 })
  phoneNumberHash: string;

  /**
   * Type of SMS: INBOX, SENT, DRAFT, OUTBOX, FAILED, QUEUED
   */
  @Column({ type: 'varchar', length: 20 })
  smsType: string;

  /**
   * Whether the message was marked as read on the device
   */
  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  /**
   * Whether the message was marked as seen in the UI
   */
  @Column({ type: 'boolean', default: false })
  isSeen: boolean;

  /**
   * Conversation thread ID from Android's SMS database
   * Allows grouping messages into conversations without content
   */
  @Column({ type: 'bigint' })
  threadId: string;

  /**
   * When the SMS was sent/received (timestamp from device)
   */
  @Column({ type: 'timestamp' })
  timestamp: Date;

  /**
   * When the SMS metadata entry was received by the backend
   */
  @CreateDateColumn({ type: 'timestamp' })
  receivedAt: Date;
}
