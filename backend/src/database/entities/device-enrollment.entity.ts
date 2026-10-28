import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { Device } from './device.entity';
import { DeviceCredential } from './device-credential.entity';
import { EnrollmentStatus } from '@shared/types/enrollment.types';

@Entity('device_enrollments')
@Index(['deviceId'])
@Index(['status'])
export class DeviceEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  enrollmentToken: string;

  @Column({ type: 'enum', enum: EnrollmentStatus, default: EnrollmentStatus.PENDING })
  status: EnrollmentStatus;

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ nullable: true })
  enrolledAt: Date;

  @Column({ nullable: true })
  revokedAt: Date;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Device, (device) => device.enrollments)
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column({ nullable: true })
  deviceId?: string;

  @OneToOne(() => DeviceCredential, (credential) => credential.enrollment)
  credential: DeviceCredential;
}
