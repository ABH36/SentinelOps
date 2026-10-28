import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DevicesModule } from './devices/devices.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { InventoryModule } from './inventory/inventory.module';
import { HeartbeatModule } from './heartbeat/heartbeat.module';
import { AuditModule } from './audit/audit.module';
import { JobsModule } from './jobs/jobs.module';
import { PoliciesModule } from './policies/policies.module';
import { RemoteActionsModule } from './remote-actions/remote-actions.module';
import { UsageModule } from './usage/usage.module';
import { AlertsModule } from './alerts/alerts.module';
import { EventsModule } from './events/events.module';
import { EvidenceModule } from './evidence/evidence.module';
import { GatewayModule } from './gateway/gateway.module';
import { TelemetryModule } from './telemetry/telemetry.module';

import { databaseConfig } from './config/database.config';
import { redisConfig } from './config/redis.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      useFactory: databaseConfig,
    }),
    BullModule.forRootAsync({
      useFactory: redisConfig,
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    DevicesModule,
    EnrollmentModule,
    InventoryModule,
    HeartbeatModule,
    AuditModule,
    JobsModule,
    PoliciesModule,
    RemoteActionsModule,
    UsageModule,
    AlertsModule,
    EventsModule,
    EvidenceModule,
    GatewayModule,
    TelemetryModule,
  ],
})
export class AppModule {}
