import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { Evidence } from './entities/evidence.entity';
import { ForensicBundle } from '../database/entities/forensic-bundle.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Evidence, ForensicBundle]),
    MulterModule.register({
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB max bundle size
      },
    }),
  ],
  controllers: [EvidenceController],
  providers: [EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
