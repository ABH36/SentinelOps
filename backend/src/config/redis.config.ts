import { BullModuleOptions } from '@nestjs/bull';

export const redisConfig = (): BullModuleOptions => ({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
});
