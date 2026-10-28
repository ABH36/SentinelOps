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

@Entity('device_inventories')
@Index(['deviceId'])
@Index(['deviceId', 'createdAt'])
export class DeviceInventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'json' })
  hardware: {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    cpu?: string;
    cpuCores?: number;
    ram?: number;
    storage?: number;
    storageType?: string;
    batteryHealth?: number;
  };

  @Column({ type: 'json' })
  operatingSystem: {
    name?: string;
    version?: string;
    build?: string;
    architecture?: string;
    kernelVersion?: string;
  };

  @Column({ type: 'json' })
  network: {
    macAddress?: string;
    ipAddress?: string;
    hostname?: string;
    networkInterfaces?: Array<{
      name: string;
      macAddress: string;
      ipAddress: string;
    }>;
  };

  @Column({ type: 'json', nullable: true })
  software: {
    installedApplications?: Array<{
      name: string;
      version: string;
      publisher?: string;
      installDate?: string;
    }>;
    updatesAvailable?: number;
  };

  @Column({ type: 'json', nullable: true })
  security: {
    antivirus?: string;
    firewallEnabled?: boolean;
    lastScanDate?: string;
    encryptionEnabled?: boolean;
  };

  @Column({ type: 'json', nullable: true })
  agent: {
    version?: string;
    installDate?: string;
    lastUpdate?: string;
  };

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Device, (device) => device.inventories)
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column()
  deviceId: string;
}
