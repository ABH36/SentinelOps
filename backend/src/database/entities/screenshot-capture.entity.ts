import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Device } from './device.entity';
import { RemoteAction } from './remote-action.entity';

@Entity('screenshot_captures')
@Index(['deviceId', 'capturedAt'])
@Index(['commandId'])
export class ScreenshotCapture {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'command_id', nullable: true })
  @Index()
  commandId: string;

  @Column({ name: 'device_id' })
  @Index()
  deviceId: string;

  @Column({ name: 'screenshot_data', type: 'text' })
  screenshotData: string; // base64 encoded image

  @Column({ name: 'screen_index', default: 0 })
  screenIndex: number;

  @Column({ name: 'width' })
  width: number;

  @Column({ name: 'height' })
  height: number;

  @Column({ name: 'is_primary', default: false })
  isPrimary: boolean;

  @Column({ name: 'device_name', nullable: true })
  deviceName: string;

  @Column({ name: 'size_kb' })
  sizeKB: number;

  @Column({ name: 'captured_at', type: 'timestamp' })
  @Index()
  capturedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ManyToOne(() => RemoteAction, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'command_id' })
  command: RemoteAction;
}
