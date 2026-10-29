import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('app_usage')
@Index(['agentId', 'collectedAt'])
@Index(['packageName'])
@Index(['foregroundTime'])
export class AppUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  agentId: string;

  @Column({ type: 'varchar', length: 255 })
  packageName: string;

  @Column({ type: 'varchar', length: 255 })
  appName: string;

  @Column({ type: 'bigint' })
  foregroundTime: string; // milliseconds as string for bigint

  @Column({ type: 'int' })
  launchCount: number;

  @Column({ type: 'timestamp' })
  lastUsed: Date;

  @Column({ type: 'timestamp' })
  collectedAt: Date;

  @CreateDateColumn({ type: 'timestamp' })
  receivedAt: Date;
}
