import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { MediaActivity } from '../database/entities/media-activity.entity';

/**
 * Media Activity Service
 * 
 * Processes microphone and camera usage activity from Windows agents.
 * Provides privacy risk analysis, unauthorized access detection, and compliance monitoring.
 * 
 * Security Features:
 * - Unauthorized microphone/camera access detection
 * - Background recording detection (process running without user awareness)
 * - Suspicious process pattern detection (malware, spyware)
 * - Application whitelist/blacklist enforcement
 * - Privacy compliance monitoring (GDPR, CCPA, HIPAA)
 * 
 * Risk Classification:
 * - AUTHORIZED: Known/approved application on whitelist
 * - UNAUTHORIZED: Unapproved application accessing device
 * - SUSPICIOUS: Known malware/spyware pattern
 * - UNKNOWN: Cannot determine risk level (default allow)
 */
@Injectable()
export class MediaActivityService {
  private readonly logger = new Logger(MediaActivityService.name);

  // Known authorized applications (in production, fetch from database policy)
  private readonly authorizedMicrophoneApps = new Set([
    'zoom',
    'teams',
    'skype',
    'discord',
    'slack',
    'chrome',
    'msedge',
    'firefox',
    'webexmta', // Webex
    'lync', // Skype for Business
  ]);

  private readonly authorizedCameraApps = new Set([
    'zoom',
    'teams',
    'skype',
    'discord',
    'chrome',
    'msedge',
    'firefox',
    'webexmta',
    'lync',
    'obs64', // OBS Studio
    'streamlabs obs',
  ]);

  // Suspicious process name patterns (malware, spyware, unauthorized recording tools)
  private readonly suspiciousPatterns = [
    /keylog/i,
    /spyware/i,
    /trojan/i,
    /backdoor/i,
    /rat\./i, // Remote Access Trojan
    /stealer/i,
    /grabber/i,
    /svchost.*\d+/i, // Fake svchost with numbers
    /csrss.*\d+/i, // Fake csrss
    /winlogon.*\d+/i, // Fake winlogon
    /lsass.*\d+/i, // Fake lsass
    /services.*\d+/i, // Fake services
  ];

  constructor(
    @InjectRepository(MediaActivity)
    private readonly mediaActivityRepository: Repository<MediaActivity>,
  ) {}

  /**
   * Store media activity with privacy risk analysis
   */
  async storeMediaActivity(agentId: string, activityData: any): Promise<{ stored: number; flagged: number }> {
    try {
      const checkedAt = activityData.checkedAt ? new Date(activityData.checkedAt) : new Date();
      const activities = activityData.activities || [];

      let stored = 0;
      let flagged = 0;

      for (const activity of activities) {
        try {
          const detectedAt = activity.detectedAt ? new Date(activity.detectedAt) : checkedAt;
          const activeSince = activity.activeSince ? new Date(activity.activeSince) : null;
          const stoppedAt = activity.stoppedAt ? new Date(activity.stoppedAt) : null;

          // Calculate duration if stopped
          let durationSeconds: number | null = null;
          if (stoppedAt && activeSince) {
            durationSeconds = Math.floor((stoppedAt.getTime() - activeSince.getTime()) / 1000);
          } else if (stoppedAt && detectedAt) {
            durationSeconds = Math.floor((stoppedAt.getTime() - detectedAt.getTime()) / 1000);
          }

          // Perform privacy risk analysis
          const riskAnalysis = this.analyzePrivacyRisk(activity);

          const mediaActivity = this.mediaActivityRepository.create({
            agentId,
            deviceType: activity.deviceType,
            processId: activity.processId || 0,
            processName: activity.processName,
            processPath: activity.processPath,
            appPackageName: activity.appPackageName,
            isActive: activity.isActive !== false, // Default to true if not specified
            riskLevel: riskAnalysis.riskLevel,
            isAuthorized: riskAnalysis.isAuthorized,
            isSuspicious: riskAnalysis.isSuspicious,
            threats: riskAnalysis.threats,
            activeSince,
            stoppedAt,
            durationSeconds,
            detectedAt,
          });

          await this.mediaActivityRepository.save(mediaActivity);
          stored++;

          if (!riskAnalysis.isAuthorized || riskAnalysis.threats.length > 0) {
            flagged++;

            this.logger.warn(
              `Media Privacy Alert - Agent: ${agentId}, Device: ${activity.deviceType}, ` +
              `Process: ${activity.processName}, Risk: ${riskAnalysis.riskLevel}, ` +
              `Threats: [${riskAnalysis.threats.join(', ')}]`,
            );
          }

          // Log activity start/stop
          if (activity.isActive) {
            this.logger.log(
              `${activity.deviceType} started: ${activity.processName} on agent ${agentId}`,
            );
          } else {
            this.logger.log(
              `${activity.deviceType} stopped: ${activity.processName} on agent ${agentId} ` +
              `(duration: ${durationSeconds ? durationSeconds + 's' : 'unknown'})`,
            );
          }
        } catch (error) {
          this.logger.error(`Failed to store media activity ${activity.processName} for agent ${agentId}:`, error);
        }
      }

      this.logger.log(
        `Stored media activities for agent ${agentId}: ${stored} activities, ${flagged} flagged`,
      );

      return { stored, flagged };
    } catch (error) {
      this.logger.error(`Failed to store media activities for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Analyze privacy risk and assign risk level
   */
  private analyzePrivacyRisk(activityData: any): {
    riskLevel: string;
    isAuthorized: boolean;
    isSuspicious: boolean;
    threats: string[];
  } {
    const threats: string[] = [];
    let riskLevel = 'UNKNOWN';
    let isAuthorized = true; // Default allow
    let isSuspicious = false;

    const deviceType = activityData.deviceType || '';
    const processName = (activityData.processName || '').toLowerCase();
    const processPath = (activityData.processPath || '').toLowerCase();

    // Check if application is on authorized whitelist
    if (deviceType === 'Microphone') {
      isAuthorized = this.authorizedMicrophoneApps.has(processName);
    } else if (deviceType === 'Camera') {
      isAuthorized = this.authorizedCameraApps.has(processName);
    }

    // Threat 1: Unauthorized application
    if (!isAuthorized && processName) {
      threats.push('UNAUTHORIZED_ACCESS');
      riskLevel = 'UNAUTHORIZED';
    }

    // Threat 2: Suspicious process name pattern (malware indicators)
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(processName) || pattern.test(processPath)) {
        threats.push('SUSPICIOUS_PATTERN');
        riskLevel = 'SUSPICIOUS';
        isSuspicious = true;
        break;
      }
    }

    // Threat 3: Unknown process (empty or generic name)
    if (!processName || processName === 'unknown' || processName === 'system') {
      threats.push('UNKNOWN_PROCESS');
      if (riskLevel === 'UNKNOWN') {
        riskLevel = 'SUSPICIOUS';
        isSuspicious = true;
      }
    }

    // Threat 4: Background recording (process not in foreground)
    // Note: Would need additional data from agent to determine if process is in foreground
    // For now, flag processes in suspicious paths
    const suspiciousPaths = ['\\temp\\', '\\appdata\\local\\temp\\', '\\windows\\temp\\'];
    if (suspiciousPaths.some(path => processPath.includes(path))) {
      threats.push('BACKGROUND_RECORDING');
      if (riskLevel === 'UNKNOWN') {
        riskLevel = 'SUSPICIOUS';
        isSuspicious = true;
      }
    }

    // Threat 5: System process using media (unusual)
    const systemProcesses = ['svchost', 'csrss', 'lsass', 'services', 'winlogon'];
    if (systemProcesses.includes(processName)) {
      threats.push('SYSTEM_PROCESS_MEDIA_ACCESS');
      riskLevel = 'SUSPICIOUS';
      isSuspicious = true;
    }

    // Authorized applications are secure if no other threats detected
    if (isAuthorized && threats.length === 0) {
      riskLevel = 'AUTHORIZED';
    }

    return {
      riskLevel,
      isAuthorized,
      isSuspicious,
      threats,
    };
  }

  /**
   * Get media activities for an agent
   */
  async getAgentActivities(
    agentId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<MediaActivity[]> {
    return this.mediaActivityRepository.find({
      where: { agentId },
      order: { detectedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get media activities in time range
   */
  async getActivitiesInRange(
    agentId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<MediaActivity[]> {
    return this.mediaActivityRepository.find({
      where: {
        agentId,
        detectedAt: Between(startDate, endDate),
      },
      order: { detectedAt: 'ASC' },
    });
  }

  /**
   * Get unauthorized media activities
   */
  async getUnauthorizedActivities(
    agentId?: string,
    limit: number = 100,
  ): Promise<MediaActivity[]> {
    const where: any = { isAuthorized: false };
    if (agentId) {
      where.agentId = agentId;
    }

    return this.mediaActivityRepository.find({
      where,
      order: { detectedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get suspicious media activities
   */
  async getSuspiciousActivities(
    agentId?: string,
    limit: number = 100,
  ): Promise<MediaActivity[]> {
    const where: any = { isSuspicious: true };
    if (agentId) {
      where.agentId = agentId;
    }

    return this.mediaActivityRepository.find({
      where,
      order: { detectedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get currently active media sessions
   */
  async getActiveActivities(
    agentId: string,
    deviceType?: string,
  ): Promise<MediaActivity[]> {
    const where: any = { agentId, isActive: true };
    if (deviceType) {
      where.deviceType = deviceType;
    }

    return this.mediaActivityRepository.find({
      where,
      order: { detectedAt: 'DESC' },
    });
  }

  /**
   * Search activities by process name
   */
  async searchByProcessName(
    processName: string,
    limit: number = 100,
  ): Promise<MediaActivity[]> {
    const queryBuilder = this.mediaActivityRepository.createQueryBuilder('media_activity');

    queryBuilder.where('media_activity.processName LIKE :processName', {
      processName: `%${processName}%`,
    });
    queryBuilder.orderBy('media_activity.detectedAt', 'DESC');
    queryBuilder.limit(limit);

    return queryBuilder.getMany();
  }

  /**
   * Get media activity statistics for an agent
   */
  async getStatistics(agentId: string, days: number = 7): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const activities = await this.getActivitiesInRange(agentId, startDate, new Date());

    const stats = {
      totalActivities: activities.length,
      microphoneActivities: 0,
      cameraActivities: 0,
      unauthorizedActivities: 0,
      suspiciousActivities: 0,
      uniqueProcesses: new Set<string>(),
      riskLevels: {} as Record<string, number>,
      threatsSummary: {} as Record<string, number>,
      deviceTypeDistribution: {} as Record<string, number>,
      averageDuration: 0,
      totalDuration: 0,
      activitiesWithDuration: 0,
    };

    let totalDuration = 0;
    let activitiesWithDuration = 0;

    for (const activity of activities) {
      // Device type counts
      if (activity.deviceType === 'Microphone') {
        stats.microphoneActivities++;
      } else if (activity.deviceType === 'Camera') {
        stats.cameraActivities++;
      }

      // Device type distribution
      stats.deviceTypeDistribution[activity.deviceType] =
        (stats.deviceTypeDistribution[activity.deviceType] || 0) + 1;

      // Unauthorized count
      if (!activity.isAuthorized) {
        stats.unauthorizedActivities++;
      }

      // Suspicious count
      if (activity.isSuspicious) {
        stats.suspiciousActivities++;
      }

      // Unique processes
      if (activity.processName) {
        stats.uniqueProcesses.add(activity.processName);
      }

      // Risk level distribution
      stats.riskLevels[activity.riskLevel] = (stats.riskLevels[activity.riskLevel] || 0) + 1;

      // Threats summary
      if (activity.threats) {
        for (const threat of activity.threats) {
          stats.threatsSummary[threat] = (stats.threatsSummary[threat] || 0) + 1;
        }
      }

      // Duration statistics
      if (activity.durationSeconds !== null && activity.durationSeconds > 0) {
        totalDuration += activity.durationSeconds;
        activitiesWithDuration++;
      }
    }

    stats.averageDuration = activitiesWithDuration > 0 ? Math.round(totalDuration / activitiesWithDuration) : 0;
    stats.totalDuration = totalDuration;
    stats.activitiesWithDuration = activitiesWithDuration;

    return {
      ...stats,
      uniqueProcesses: stats.uniqueProcesses.size,
      timeRange: {
        start: startDate,
        end: new Date(),
        days,
      },
    };
  }

  /**
   * Get longest recording sessions
   */
  async getLongestSessions(
    agentId: string,
    deviceType?: string,
    limit: number = 10,
  ): Promise<MediaActivity[]> {
    const queryBuilder = this.mediaActivityRepository.createQueryBuilder('media_activity');

    queryBuilder.where('media_activity.agentId = :agentId', { agentId });
    queryBuilder.andWhere('media_activity.durationSeconds IS NOT NULL');
    queryBuilder.andWhere('media_activity.durationSeconds > 0');

    if (deviceType) {
      queryBuilder.andWhere('media_activity.deviceType = :deviceType', { deviceType });
    }

    queryBuilder.orderBy('media_activity.durationSeconds', 'DESC');
    queryBuilder.limit(limit);

    return queryBuilder.getMany();
  }

  /**
   * Get privacy compliance report
   */
  async getComplianceReport(agentId: string, days: number = 30): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const activities = await this.getActivitiesInRange(agentId, startDate, new Date());

    const report = {
      agentId,
      reportPeriod: {
        start: startDate,
        end: new Date(),
        days,
      },
      summary: {
        totalActivities: activities.length,
        authorizedActivities: 0,
        unauthorizedActivities: 0,
        suspiciousActivities: 0,
      },
      complianceIssues: [] as any[],
      recommendations: [] as string[],
    };

    for (const activity of activities) {
      if (activity.isAuthorized) {
        report.summary.authorizedActivities++;
      } else {
        report.summary.unauthorizedActivities++;

        // Log compliance issue
        report.complianceIssues.push({
          timestamp: activity.detectedAt,
          deviceType: activity.deviceType,
          processName: activity.processName,
          riskLevel: activity.riskLevel,
          threats: activity.threats,
          duration: activity.durationSeconds,
        });
      }

      if (activity.isSuspicious) {
        report.summary.suspiciousActivities++;
      }
    }

    // Generate recommendations
    if (report.summary.unauthorizedActivities > 0) {
      report.recommendations.push(
        `Review and update authorized application whitelist (${report.summary.unauthorizedActivities} unauthorized accesses detected)`,
      );
    }

    if (report.summary.suspiciousActivities > 0) {
      report.recommendations.push(
        `Investigate suspicious media access patterns (${report.summary.suspiciousActivities} suspicious activities detected)`,
      );
    }

    if (report.complianceIssues.length === 0) {
      report.recommendations.push('No compliance issues detected - maintain current privacy policies');
    }

    return report;
  }
}
