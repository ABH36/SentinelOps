import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { JobsService } from './jobs.service';
import { Device } from '../database/entities/device.entity';
import { DeviceEnrollment } from '../database/entities/device-enrollment.entity';
import { DatabaseModule } from '../database/database.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HeartbeatModule } from '../heartbeat/heartbeat.module';

@Module({
  imports: [
    DatabaseModule,
    HeartbeatModule,
    TypeOrmModule.forFeature([Device, DeviceEnrollment]),
    BullModule.registerQueue({
      name: 'heartbeat-timeout',
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),
    BullModule.registerQueue({
      name: 'enrollment-cleanup',
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),
    BullModule.registerQueue({
      name: 'audit-archival',
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),
  ],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
