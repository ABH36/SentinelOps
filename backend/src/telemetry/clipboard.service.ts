import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClipboardEvent } from '../database/entities/clipboard-event.entity';

export interface SubmitClipboardEventDto {
  content: string;
  contentLength: number;
  truncated?: boolean;
  activeProcess: string;
  capturedAt: string;
}

@Injectable()
export class ClipboardService {
  private readonly logger = new Logger(ClipboardService.name);

  // Sensitive data patterns for detection
  private readonly sensitivePatterns = {
    creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    apiKey: /\b[A-Za-z0-9]{32,}\b/g,
    password: /password[:\s=]+\S+/gi,
    privateKey: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/gi,
    awsAccessKey: /\bAKIA[0-9A-Z]{16}\b/g,
  };

  constructor(
    @InjectRepository(ClipboardEvent)
    private clipboardEventRepository: Repository<ClipboardEvent>,
  ) {}

  /**
   * Submit clipboard event from agent
   */
  async submitClipboardEvent(
    deviceId: string,
    tenantId: string,
    dto: SubmitClipboardEventDto,
  ): Promise<ClipboardEvent> {
    this.logger.debug(
      `Clipboard event from device ${deviceId}: ${dto.contentLength} chars, process: ${dto.activeProcess}`,
    );

    // Analyze content for sensitive data patterns
    const analysis = this.analyzeContent(dto.content);

    // Create event
    const clipboardEvent = this.clipboardEventRepository.create({
      deviceId,
      tenantId,
      content: dto.content,
      contentLength: dto.contentLength,
      truncated: dto.truncated || false,
      activeProcess: dto.activeProcess,
      capturedAt: new Date(dto.capturedAt),
      metadata: {
        containsSensitivePatterns: analysis.detectedPatterns.length > 0,
        detectedPatterns: analysis.detectedPatterns,
        riskLevel: analysis.riskLevel,
        flagged: analysis.flagged,
        flaggedReason: analysis.flaggedReason,
      },
    });

    const savedEvent = await this.clipboardEventRepository.save(clipboardEvent);

    // Log if sensitive data detected
    if (analysis.detectedPatterns.length > 0) {
      this.logger.warn(
        `Sensitive data detected in clipboard - Device: ${deviceId}, Patterns: ${analysis.detectedPatterns.join(', ')}, Risk: ${analysis.riskLevel}`,
      );
    }

    return savedEvent;
  }

  /**
   * Analyze clipboard content for sensitive data patterns
   */
  private analyzeContent(content: string): {
    detectedPatterns: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    flagged: boolean;
    flaggedReason?: string;
  } {
    const detectedPatterns: string[] = [];

    // Check each pattern
    if (this.sensitivePatterns.creditCard.test(content)) {
      detectedPatterns.push('CREDIT_CARD');
    }
    if (this.sensitivePatterns.ssn.test(content)) {
      detectedPatterns.push('SSN');
    }
    if (this.sensitivePatterns.email.test(content)) {
      detectedPatterns.push('EMAIL');
    }
    if (this.sensitivePatterns.apiKey.test(content)) {
      detectedPatterns.push('API_KEY');
    }
    if (this.sensitivePatterns.password.test(content)) {
      detectedPatterns.push('PASSWORD');
    }
    if (this.sensitivePatterns.privateKey.test(content)) {
      detectedPatterns.push('PRIVATE_KEY');
    }
    if (this.sensitivePatterns.awsAccessKey.test(content)) {
      detectedPatterns.push('AWS_ACCESS_KEY');
    }

    // Determine risk level
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    let flagged = false;
    let flaggedReason: string | undefined;

    if (detectedPatterns.length === 0) {
      riskLevel = 'LOW';
    } else if (
      detectedPatterns.includes('PRIVATE_KEY') ||
      detectedPatterns.includes('AWS_ACCESS_KEY')
    ) {
      riskLevel = 'CRITICAL';
      flagged = true;
      flaggedReason = 'Critical credentials detected in clipboard';
    } else if (
      detectedPatterns.includes('PASSWORD') ||
      detectedPatterns.includes('API_KEY')
    ) {
      riskLevel = 'HIGH';
      flagged = true;
      flaggedReason = 'Authentication credentials detected in clipboard';
    } else if (
      detectedPatterns.includes('CREDIT_CARD') ||
      detectedPatterns.includes('SSN')
    ) {
      riskLevel = 'HIGH';
      flagged = true;
      flaggedReason = 'Sensitive personal data detected in clipboard';
    } else if (detectedPatterns.includes('EMAIL')) {
      riskLevel = 'MEDIUM';
    }

    return {
      detectedPatterns,
      riskLevel,
      flagged,
      flaggedReason,
    };
  }

  /**
   * Get clipboard events for a device
   */
  async getDeviceClipboardEvents(
    deviceId: string,
    tenantId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ events: ClipboardEvent[]; total: number }> {
    const [events, total] = await this.clipboardEventRepository.findAndCount({
      where: { deviceId, tenantId },
      order: { capturedAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { events, total };
  }

  /**
   * Get flagged clipboard events (sensitive data detected)
   */
  async getFlaggedEvents(
    tenantId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ events: ClipboardEvent[]; total: number }> {
    const queryBuilder = this.clipboardEventRepository
      .createQueryBuilder('clipboard')
      .where('clipboard.tenantId = :tenantId', { tenantId })
      .andWhere("clipboard.metadata->>'flagged' = 'true'")
      .orderBy('clipboard.capturedAt', 'DESC')
      .take(limit)
      .skip(offset);

    const [events, total] = await queryBuilder.getManyAndCount();

    return { events, total };
  }

  /**
   * Search clipboard content
   */
  async searchContent(
    tenantId: string,
    searchTerm: string,
    limit = 100,
  ): Promise<ClipboardEvent[]> {
    return this.clipboardEventRepository
      .createQueryBuilder('clipboard')
      .where('clipboard.tenantId = :tenantId', { tenantId })
      .andWhere('LOWER(clipboard.content) LIKE LOWER(:searchTerm)', {
        searchTerm: `%${searchTerm}%`,
      })
      .orderBy('clipboard.capturedAt', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Get clipboard statistics
   */
  async getStatistics(tenantId: string): Promise<{
    totalEvents: number;
    flaggedEvents: number;
    topProcesses: Array<{ process: string; count: number }>;
    riskDistribution: Record<string, number>;
  }> {
    const totalEvents = await this.clipboardEventRepository.count({
      where: { tenantId },
    });

    const flaggedEvents = await this.clipboardEventRepository
      .createQueryBuilder('clipboard')
      .where('clipboard.tenantId = :tenantId', { tenantId })
      .andWhere("clipboard.metadata->>'flagged' = 'true'")
      .getCount();

    // Top processes
    const topProcessesResult = await this.clipboardEventRepository
      .createQueryBuilder('clipboard')
      .select('clipboard.activeProcess', 'process')
      .addSelect('COUNT(*)', 'count')
      .where('clipboard.tenantId = :tenantId', { tenantId })
      .groupBy('clipboard.activeProcess')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    const topProcesses = topProcessesResult.map((r) => ({
      process: r.process,
      count: parseInt(r.count, 10),
    }));

    // Risk distribution
    const riskResult = await this.clipboardEventRepository
      .createQueryBuilder('clipboard')
      .select("clipboard.metadata->>'riskLevel'", 'riskLevel')
      .addSelect('COUNT(*)', 'count')
      .where('clipboard.tenantId = :tenantId', { tenantId })
      .groupBy('riskLevel')
      .getRawMany();

    const riskDistribution: Record<string, number> = {};
    riskResult.forEach((r) => {
      if (r.riskLevel) {
        riskDistribution[r.riskLevel] = parseInt(r.count, 10);
      }
    });

    return {
      totalEvents,
      flaggedEvents,
      topProcesses,
      riskDistribution,
    };
  }
}
