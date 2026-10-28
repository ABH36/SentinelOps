import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Device } from './device.entity';
import { Tenant } from './tenant.entity';
import { SessionActivityState } from '@shared/types/usage.types';

@Entity('device_usage_events')
@Index(['tenantId', 'timestamp'])
@Index(['deviceId', 'timestamp'])
@Index(['deviceId', 'activeWindowProcess'])
export class DeviceUsageEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column()
  deviceId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  employeeId: string;

  @Column()
  activeWindowProcess: string;

  @Column({ nullable: true })
  activeWindowTitle: string;

  @Column({ type: 'int', default: 0 })
  activeDurationSeconds: number;

  @Column({ type: 'int', default: 0 })
  idleDurationSeconds: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: SessionActivityState.ACTIVE,
  })
  activityState: SessionActivityState;

  @Column({ default: true })
  isWorkHours: boolean;

  @Column({ type: 'timestamp' })
  timestamp: Date;

  @Column({ type: 'varchar', length: 64 })
  provenanceHash: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  previousHash: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
