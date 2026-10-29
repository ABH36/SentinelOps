import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { CallLog } from '../database/entities/call-log.entity';

@Injectable()
export class CallLogService {
  private readonly logger = new Logger(CallLogService.name);

  constructor(
    @InjectRepository(CallLog)
    private readonly callLogRepository: Repository<CallLog>,
  ) {}

  async storeCallLogs(agentId: string, payload: any): Promise<void> {
    try {
      const callLogs = payload.callLogs || [];
      
      if (callLogs.length === 0) {
        this.logger.debug(`No call logs to store for agent ${agentId}`);
        return;
      }

      const entities = callLogs.map((log: any) => {
        const entity = new CallLog();
        entity.agentId = agentId;
        entity.phoneNumberHash = log.phoneNumberHash;
        entity.callType = log.callType;
        entity.duration = log.duration;
        entity.cachedNameAvailable = log.cachedNameAvailable || false;
        entity.numberType = log.numberType;
        entity.isRead = log.isRead;
        entity.timestamp = new Date(log.timestamp);
        return entity;
      });

      await this.callLogRepository.save(entities);
      this.logger.log(`Stored ${callLogs.length} call logs for agent ${agentId}`);
    } catch (error) {
      this.logger.error(`Failed to store call logs for agent ${agentId}: ${error.message}`);
      throw error;
    }
  }

  async getAgentCallLogs(agentId: string, limit: number = 500): Promise<CallLog[]> {
    return this.callLogRepository.find({
      where: { agentId },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  async getCallStatistics(agentId: string, hours: number = 24): Promise<any> {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    const calls = await this.callLogRepository.find({
      where: { agentId, timestamp: MoreThan(since) },
    });

    return {
      totalCalls: calls.length,
      incomingCalls: calls.filter(c => c.callType === 'INCOMING').length,
      outgoingCalls: calls.filter(c => c.callType === 'OUTGOING').length,
      missedCalls: calls.filter(c => c.callType === 'MISSED').length,
      totalDuration: calls.reduce((sum, c) => sum + c.duration, 0),
      averageDuration: calls.length > 0 ? calls.reduce((sum, c) => sum + c.duration, 0) / calls.length : 0,
      uniqueContacts: new Set(calls.map(c => c.phoneNumberHash)).size,
    };
  }

  async getFrequentContacts(agentId: string, limit: number = 10): Promise<any[]> {
    const result = await this.callLogRepository
      .createQueryBuilder('call')
      .select('call.phoneNumberHash', 'phoneNumberHash')
      .addSelect('COUNT(*)', 'count')
      .where('call.agentId = :agentId', { agentId })
      .groupBy('call.phoneNumberHash')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany();

    return result.map(r => ({
      phoneNumberHash: r.phoneNumberHash,
      callCount: parseInt(r.count, 10),
    }));
  }
}
