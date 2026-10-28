import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Device } from './device.entity';
import { Tenant } from './tenant.entity';
import {
  RemoteActionType,
  RemoteActionStatus,
  RemoteActionPriority,
} from '@shared/types/remote-action.types';

@Entity('remote_actions')
@Index(['tenantId', 'status'])
@Index(['deviceId', 'status'])
export class RemoteAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  actionType: RemoteActionType;

  @Column({
    type: 'varchar',
    length: 50,
    default: RemoteActionStatus.PENDING,
  })
  status: RemoteActionStatus;

  @Column({
    type: 'varchar',
    length: 20,
    default: RemoteActionPriority.NORMAL,
  })
  priority: RemoteActionPriority;

  @Column({ type: 'json', nullable: true })
  payload: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  result: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ default: false })
  requiresApproval: boolean;

  @Column({ default: false })
  isApproved: boolean;

  @Column({ default: false })
  isAuto: boolean; // Flag for automated system-initiated actions

  @Column({ nullable: true })
  approvedBy: string;

  @Column({ nullable: true })
  approvedAt: Date;

  @Column({ nullable: true })
  scheduledAt: Date;

  @Column({ nullable: true })
  dispatchedAt: Date;

  @Column({ nullable: true })
  executedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column()
  deviceId: string;

  @Column({ nullable: true })
  requestedBy: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: string;
}
