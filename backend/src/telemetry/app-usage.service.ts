import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { AppUsage } from '../database/entities/app-usage.entity';

@Injectable()
export class AppUsageService {
  private readonly logger = new Logger(AppUsageService.name);

  constructor(
    @InjectRepository(AppUsage)
    private readonly appUsageRepository: Repository<AppUsage>,
  ) {}

  async storeAppUsage(agentId: string, payload: any): Promise<void> {
    try {
      const appUsageList = payload.appUsage || [];
      if (appUsageList.length === 0) return;

      const entities = appUsageList.map((app: any) => {
        const entity = new AppUsage();
        entity.agentId = agentId;
        entity.packageName = app.packageName;
        entity.appName = app.appName;
        entity.foregroundTime = app.foregroundTime.toString();
        entity.launchCount = app.launchCount;
        entity.lastUsed = new Date(app.lastUsed);
        entity.collectedAt = new Date(payload.collectedAt);
        return entity;
      });

      await this.appUsageRepository.save(entities);
      this.logger.log(`Stored usage stats for ${appUsageList.length} apps (agent ${agentId})`);
    } catch (error) {
      this.logger.error(`Failed to store app usage: ${error.message}`);
      throw error;
    }
  }

  async getAgentAppUsage(agentId: string, limit: number = 100): Promise<AppUsage[]> {
    return this.appUsageRepository.find({
      where: { agentId },
      order: { collectedAt: 'DESC', foregroundTime: 'DESC' },
      take: limit,
    });
  }

  async getTopApps(agentId: string, limit: number = 10): Promise<AppUsage[]> {
    return this.appUsageRepository.find({
      where: { agentId },
      order: { foregroundTime: 'DESC' },
      take: limit,
    });
  }

  async getAppUsageStatistics(agentId: string, hours: number = 24): Promise<any> {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    const apps = await this.appUsageRepository.find({
      where: { agentId, collectedAt: MoreThan(since) },
    });

    const totalForegroundTime = apps.reduce((sum, app) => sum + parseInt(app.foregroundTime, 10), 0);
    const totalLaunches = apps.reduce((sum, app) => sum + app.launchCount, 0);

    return {
      uniqueApps: apps.length,
      totalForegroundTime,
      totalLaunches,
      averageSessionDuration: totalLaunches > 0 ? Math.round(totalForegroundTime / totalLaunches) : 0,
      topApps: apps.sort((a, b) => parseInt(b.foregroundTime, 10) - parseInt(a.foregroundTime, 10)).slice(0, 5),
    };
  }
}
