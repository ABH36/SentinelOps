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
import { DeviceEnrollment } from './device-enrollment.entity';

@Entity('device_credentials')
@Index(['enrollmentId'])
export class DeviceCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  deviceKey: string;

  @Column()
  deviceSecret: string;

  @Column({ nullable: true })
  keyFingerprint: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ nullable: true })
  rotatedAt: Date;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => DeviceEnrollment, (enrollment) => enrollment.credential)
  @JoinColumn({ name: 'enrollmentId' })
  enrollment: DeviceEnrollment;

  @Column()
  enrollmentId: string;
}
