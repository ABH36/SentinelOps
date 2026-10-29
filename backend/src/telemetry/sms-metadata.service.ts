import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { SmsMetadata } from '../database/entities/sms-metadata.entity';

@Injectable()
export class SmsMetadataService {
  private readonly logger = new Logger(SmsMetadataService.name);

  constructor(
    @InjectRepository(SmsMetadata)
    private readonly smsMetadataRepository: Repository<SmsMetadata>,
  ) {}

  async storeSmsMetadata(agentId: string, payload: any): Promise<void> {
    try {
      const smsMetadata = payload.smsMetadata || [];
      
      if (smsMetadata.length === 0) {
        this.logger.debug(`No SMS metadata to store for agent ${agentId}`);
        return;
      }

      const entities = smsMetadata.map((sms: any) => {
        const entity = new SmsMetadata();
        entity.agentId = agentId;
        entity.phoneNumberHash = sms.phoneNumberHash;
        entity.smsType = sms.smsType;
        entity.isRead = sms.isRead;
        entity.isSeen = sms.isSeen;
        entity.threadId = sms.threadId.toString();
        entity.timestamp = new Date(sms.timestamp);
        return entity;
      });

      await this.smsMetadataRepository.save(entities);
      this.logger.log(`Stored ${smsMetadata.length} SMS metadata entries for agent ${agentId} (NO CONTENT)`);
    } catch (error) {
      this.logger.error(`Failed to store SMS metadata for agent ${agentId}: ${error.message}`);
      throw error;
    }
  }

  async getAgentSmsMetadata(agentId: string, limit: number = 500): Promise<SmsMetadata[]> {
    return this.smsMetadataRepository.find({
      where: { agentId },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  async getSmsStatistics(agentId: string, hours: number = 24): Promise<any> {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    const messages = await this.smsMetadataRepository.find({
      where: { agentId, timestamp: MoreThan(since) },
    });

    return {
      totalMessages: messages.length,
      inboxMessages: messages.filter(m => m.smsType === 'INBOX').length,
      sentMessages: messages.filter(m => m.smsType === 'SENT').length,
      uniqueContacts: new Set(messages.map(m => m.phoneNumberHash)).size,
      uniqueConversations: new Set(messages.map(m => m.threadId)).size,
      unreadMessages: messages.filter(m => !m.isRead).length,
    };
  }
}
