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

@Entity('device_heartbeats')
@Index(['deviceId'])
@Index(['deviceId', 'createdAt'])
export class DeviceHeartbeat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'json' })
  health: {
    cpuUsage?: number;
    memoryUsage?: number;
    diskUsage?: number;
    batteryLevel?: number;
    batteryStatus?: string;
    uptime?: number;
  };

  @Column({ type: 'json', nullable: true })
  connectivity: {
    latency?: number;
    networkSpeed?: number;
    isConnected?: boolean;
    connectionType?: string;
  };

  @Column({ type: 'json', nullable: true })
  agent: {
    status?: string;
    lastCommand?: string;
    pendingCommands?: number;
    errors?: string[];
  };

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Device, (device) => device.heartbeats)
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column()
  deviceId: string;
}
