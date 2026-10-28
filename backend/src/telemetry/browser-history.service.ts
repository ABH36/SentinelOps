import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { BrowserHistoryEntry } from '../database/entities/browser-history.entity';

export interface SubmitBrowserHistoryDto {
  entries: Array<{
    browser: string;
    url: string;
    title: string;
    visitCount: number;
    lastVisit: string;
  }>;
  collectedAt: string;
  totalEntries: number;
}

@Injectable()
export class BrowserHistoryService {
  private readonly logger = new Logger(BrowserHistoryService.name);

  // Suspicious URL patterns
  private readonly suspiciousPatterns = {
    malware: /malware|virus|trojan|ransomware/gi,
    phishing: /signin|login|verify|account|update.*password/gi,
    darkWeb: /\.onion\b/gi,
    torrents: /torrent|pirate|download.*movie|warez/gi,
    gambling: /casino|poker|betting|gamble/gi,
    adult: /porn|xxx|adult|nsfw/gi,
  };

  // Productivity categories
  private readonly productivityCategories = {
    work: /github|stackoverflow|gitlab|jira|confluence|slack|teams|zoom/gi,
    social: /facebook|twitter|instagram|linkedin|reddit|tiktok/gi,
    entertainment: /youtube|netflix|hulu|twitch|spotify/gi,
    shopping: /amazon|ebay|walmart|target|shop/gi,
    news: /news|cnn|bbc|nytimes|reuters|bloomberg/gi,
  };

  constructor(
    @InjectRepository(BrowserHistoryEntry)
    private browserHistoryRepository: Repository<BrowserHistoryEntry>,
  ) {}

  /**
   * Submit browser history from agent
   */
  async submitBrowserHistory(
    deviceId: string,
    tenantId: string,
    dto: SubmitBrowserHistoryDto,
  ): Promise<{ saved: number; flagged: number }> {
    this.logger.debug(
      `Browser history from device ${deviceId}: ${dto.totalEntries} entries`,
    );

    let savedCount = 0;
    let flaggedCount = 0;
    const collectedAt = new Date(dto.collectedAt);

    for (const entry of dto.entries) {
      try {
        // Analyze URL for suspicious content
        const analysis = this.analyzeUrl(entry.url, entry.title);

        // Extract domain from URL
        const domain = this.extractDomain(entry.url);

        // Create entry
        const historyEntry = this.browserHistoryRepository.create({
          deviceId,
          tenantId,
          browser: entry.browser,
          url: entry.url,
          title: entry.title || '',
          visitCount: entry.visitCount,
          lastVisit: new Date(entry.lastVisit),
          collectedAt,
          metadata: {
            domain,
            category: analysis.category,
            flagged: analysis.flagged,
            flaggedReason: analysis.flaggedReason,
            productivityScore: analysis.productivityScore,
            riskLevel: analysis.riskLevel,
          },
        });

        await this.browserHistoryRepository.save(historyEntry);
        savedCount++;

        if (analysis.flagged) {
          flaggedCount++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to save history entry for ${entry.url}: ${error.message}`,
        );
      }
    }

    this.logger.info(
      `Browser history saved - Device: ${deviceId}, Saved: ${savedCount}, Flagged: ${flaggedCount}`,
    );

    if (flaggedCount > 0) {
      this.logger.warn(
        `${flaggedCount} suspicious URLs detected in browser history for device ${deviceId}`,
      );
    }

    return { saved: savedCount, flagged: flaggedCount };
  }

  /**
   * Analyze URL for suspicious content and categorization
   */
  private analyzeUrl(url: string, title: string): {
    category: string;
    flagged: boolean;
    flaggedReason?: string;
    productivityScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  } {
    const combined = `${url} ${title}`.toLowerCase();

    // Check for suspicious patterns
    let flagged = false;
    let flaggedReason: string | undefined;
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

    if (this.suspiciousPatterns.malware.test(combined)) {
      flagged = true;
      flaggedReason = 'Potential malware-related URL';
      riskLevel = 'HIGH';
    } else if (this.suspiciousPatterns.phishing.test(combined)) {
      flagged = true;
      flaggedReason = 'Potential phishing URL';
      riskLevel = 'HIGH';
    } else if (this.suspiciousPatterns.darkWeb.test(url)) {
      flagged = true;
      flaggedReason = 'Dark web (.onion) URL detected';
      riskLevel = 'HIGH';
    } else if (this.suspiciousPatterns.torrents.test(combined)) {
      flagged = true;
      flaggedReason = 'Torrent/piracy-related URL';
      riskLevel = 'MEDIUM';
    } else if (this.suspiciousPatterns.gambling.test(combined)) {
      flagged = true;
      flaggedReason = 'Gambling-related URL';
      riskLevel = 'MEDIUM';
    } else if (this.suspiciousPatterns.adult.test(combined)) {
      flagged = true;
      flaggedReason = 'Adult content URL';
      riskLevel = 'MEDIUM';
    }

    // Categorize for productivity analysis
    let category = 'OTHER';
    let productivityScore = 50; // Neutral default

    if (this.productivityCategories.work.test(combined)) {
      category = 'WORK';
      productivityScore = 100;
    } else if (this.productivityCategories.social.test(combined)) {
      category = 'SOCIAL';
      productivityScore = 30;
    } else if (this.productivityCategories.entertainment.test(combined)) {
      category = 'ENTERTAINMENT';
      productivityScore = 20;
    } else if (this.productivityCategories.shopping.test(combined)) {
      category = 'SHOPPING';
      productivityScore = 40;
    } else if (this.productivityCategories.news.test(combined)) {
      category = 'NEWS';
      productivityScore = 70;
    }

    return {
      category,
      flagged,
      flaggedReason,
      productivityScore,
      riskLevel,
    };
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get browser history for a device
   */
  async getDeviceHistory(
    deviceId: string,
    tenantId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ entries: BrowserHistoryEntry[]; total: number }> {
    const [entries, total] = await this.browserHistoryRepository.findAndCount({
      where: { deviceId, tenantId },
      order: { lastVisit: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { entries, total };
  }

  /**
   * Get flagged browser history entries
   */
  async getFlaggedEntries(
    tenantId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ entries: BrowserHistoryEntry[]; total: number }> {
    const queryBuilder = this.browserHistoryRepository
      .createQueryBuilder('history')
      .where('history.tenantId = :tenantId', { tenantId })
      .andWhere("history.metadata->>'flagged' = 'true'")
      .orderBy('history.lastVisit', 'DESC')
      .take(limit)
      .skip(offset);

    const [entries, total] = await queryBuilder.getManyAndCount();

    return { entries, total };
  }

  /**
   * Search browser history
   */
  async searchHistory(
    tenantId: string,
    searchTerm: string,
    limit = 100,
  ): Promise<BrowserHistoryEntry[]> {
    return this.browserHistoryRepository
      .createQueryBuilder('history')
      .where('history.tenantId = :tenantId', { tenantId })
      .andWhere(
        '(LOWER(history.url) LIKE LOWER(:searchTerm) OR LOWER(history.title) LIKE LOWER(:searchTerm))',
        { searchTerm: `%${searchTerm}%` },
      )
      .orderBy('history.lastVisit', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Get browser history statistics
   */
  async getStatistics(
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalEntries: number;
    flaggedEntries: number;
    browserBreakdown: Record<string, number>;
    categoryBreakdown: Record<string, number>;
    topDomains: Array<{ domain: string; count: number }>;
    averageProductivity: number;
  }> {
    const whereClause: any = { tenantId };

    if (startDate && endDate) {
      whereClause.lastVisit = Between(startDate, endDate);
    }

    const totalEntries = await this.browserHistoryRepository.count({
      where: whereClause,
    });

    const flaggedEntries = await this.browserHistoryRepository
      .createQueryBuilder('history')
      .where('history.tenantId = :tenantId', { tenantId })
      .andWhere("history.metadata->>'flagged' = 'true'")
      .getCount();

    // Browser breakdown
    const browserResult = await this.browserHistoryRepository
      .createQueryBuilder('history')
      .select('history.browser', 'browser')
      .addSelect('COUNT(*)', 'count')
      .where('history.tenantId = :tenantId', { tenantId })
      .groupBy('history.browser')
      .getRawMany();

    const browserBreakdown: Record<string, number> = {};
    browserResult.forEach((r) => {
      browserBreakdown[r.browser] = parseInt(r.count, 10);
    });

    // Category breakdown
    const categoryResult = await this.browserHistoryRepository
      .createQueryBuilder('history')
      .select("history.metadata->>'category'", 'category')
      .addSelect('COUNT(*)', 'count')
      .where('history.tenantId = :tenantId', { tenantId })
      .groupBy('category')
      .getRawMany();

    const categoryBreakdown: Record<string, number> = {};
    categoryResult.forEach((r) => {
      if (r.category) {
        categoryBreakdown[r.category] = parseInt(r.count, 10);
      }
    });

    // Top domains
    const domainResult = await this.browserHistoryRepository
      .createQueryBuilder('history')
      .select("history.metadata->>'domain'", 'domain')
      .addSelect('COUNT(*)', 'count')
      .where('history.tenantId = :tenantId', { tenantId })
      .groupBy('domain')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    const topDomains = domainResult.map((r) => ({
      domain: r.domain || 'unknown',
      count: parseInt(r.count, 10),
    }));

    // Average productivity
    const productivityResult = await this.browserHistoryRepository
      .createQueryBuilder('history')
      .select("AVG((history.metadata->>'productivityScore')::int)", 'avg')
      .where('history.tenantId = :tenantId', { tenantId })
      .getRawOne();

    const averageProductivity = productivityResult?.avg
      ? parseFloat(productivityResult.avg)
      : 50;

    return {
      totalEntries,
      flaggedEntries,
      browserBreakdown,
      categoryBreakdown,
      topDomains,
      averageProductivity,
    };
  }
}
