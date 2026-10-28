import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { FileChangeEvent } from '../database/entities/file-change-event.entity';
import { v4 as uuidv4 } from 'uuid';

export interface FileChangeDto {
  changeType: string;
  filePath: string;
  oldPath?: string;
  fileSize: number;
  fileExtension: string;
  detectedAt: string;
}

export interface SubmitFileEventBatchDto {
  events: FileChangeDto[];
  batchSize: number;
  collectedAt: string;
}

@Injectable()
export class FileEventService {
  private readonly logger = new Logger(FileEventService.name);

  // Ransomware-related file extensions
  private readonly ransomwareExtensions = new Set([
    '.encrypted', '.locked', '.crypted', '.crypto', '.crypt',
    '.cerber', '.locky', '.zepto', '.osiris', '.thor',
    '.wcry', '.wncry', '.wannacry',
    '.ryuk', '.maze', '.sodinokibi', '.revil',
    '.conti', '.darkside', '.blackmatter',
    '.exx', '.ezz', '.xyz', '.zzz', '.aaa', '.micro',
  ]);

  // Suspicious executable extensions
  private readonly suspiciousExecutables = new Set([
    '.exe', '.bat', '.cmd', '.vbs', '.ps1', '.scr',
    '.com', '.pif', '.msi', '.jar',
  ]);

  // Sensitive document extensions
  private readonly sensitiveExtensions = new Set([
    '.docx', '.xlsx', '.pptx', '.pdf',
    '.doc', '.xls', '.ppt',
    '.txt', '.csv', '.sql', '.db',
  ]);

  // Archive extensions
  private readonly archiveExtensions = new Set([
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
  ]);

  // Thresholds for mass operation detection
  private readonly MASS_OPERATION_THRESHOLD = 5; // events
  private readonly RAPID_OPERATION_WINDOW_SECONDS = 10;
  private readonly HIGH_VELOCITY_THRESHOLD = 2; // events per second

  constructor(
    @InjectRepository(FileChangeEvent)
    private fileEventRepository: Repository<FileChangeEvent>,
  ) {}

  /**
   * Submit file event batch from agent
   */
  async submitFileEventBatch(
    deviceId: string,
    tenantId: string,
    dto: SubmitFileEventBatchDto,
  ): Promise<{
    saved: number;
    flagged: number;
    threats: string[];
  }> {
    this.logger.debug(
      `File events from device ${deviceId}: ${dto.batchSize} events`,
    );

    const batchId = uuidv4();
    let savedCount = 0;
    let flaggedCount = 0;
    const detectedThreats = new Set<string>();

    // Analyze batch for mass operations and ransomware behavior
    const batchAnalysis = this.analyzeBatch(dto.events);

    for (const event of dto.events) {
      try {
        // Analyze individual event
        const eventAnalysis = this.analyzeFileChange(
          event,
          batchAnalysis,
        );

        // Extract directory and file name
        const pathParts = this.extractPathInfo(event.filePath);

        // Create file change event
        const fileEvent = this.fileEventRepository.create({
          deviceId,
          tenantId,
          changeType: event.changeType,
          filePath: event.filePath,
          oldPath: event.oldPath,
          fileSize: event.fileSize,
          fileExtension: event.fileExtension || '',
          detectedAt: new Date(event.detectedAt),
          batchId,
          metadata: {
            suspiciousActivity: eventAnalysis.suspicious,
            detectedThreats: eventAnalysis.threats,
            riskLevel: eventAnalysis.riskLevel,
            flagged: eventAnalysis.flagged,
            flaggedReason: eventAnalysis.flaggedReason,
            massEncryption: batchAnalysis.massEncryption,
            suspiciousExtension: eventAnalysis.suspiciousExtension,
            rapidDeletion: batchAnalysis.rapidDeletion,
            fileCategory: eventAnalysis.fileCategory,
            sensitiveFile: eventAnalysis.sensitiveFile,
            directory: pathParts.directory,
            fileName: pathParts.fileName,
            partOfMassOperation: batchAnalysis.isMassOperation,
            operationCount: dto.batchSize,
            operationVelocity: batchAnalysis.velocity,
          },
        });

        await this.fileEventRepository.save(fileEvent);
        savedCount++;

        if (eventAnalysis.flagged) {
          flaggedCount++;
          eventAnalysis.threats.forEach((t) => detectedThreats.add(t));
        }
      } catch (error) {
        this.logger.error(
          `Failed to save file event for ${event.filePath}: ${error.message}`,
        );
      }
    }

    this.logger.info(
      `File events saved - Device: ${deviceId}, Saved: ${savedCount}, Flagged: ${flaggedCount}`,
    );

    if (flaggedCount > 0) {
      this.logger.warn(
        `⚠️ ${flaggedCount} suspicious file operations detected on device ${deviceId} - Threats: ${Array.from(detectedThreats).join(', ')}`,
      );
    }

    return {
      saved: savedCount,
      flagged: flaggedCount,
      threats: Array.from(detectedThreats),
    };
  }

  /**
   * Analyze batch for mass operation patterns
   */
  private analyzeBatch(events: FileChangeDto[]): {
    isMassOperation: boolean;
    massEncryption: boolean;
    rapidDeletion: boolean;
    velocity: number;
  } {
    if (events.length === 0) {
      return {
        isMassOperation: false,
        massEncryption: false,
        rapidDeletion: false,
        velocity: 0,
      };
    }

    // Calculate time span
    const timestamps = events.map((e) => new Date(e.detectedAt).getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const timeSpanSeconds = (maxTime - minTime) / 1000;
    const velocity = timeSpanSeconds > 0 ? events.length / timeSpanSeconds : 0;

    // Check for mass operations
    const isMassOperation = events.length >= this.MASS_OPERATION_THRESHOLD;

    // Check for mass encryption (ransomware indicator)
    const encryptedCount = events.filter((e) =>
      this.ransomwareExtensions.has(e.fileExtension?.toLowerCase() || ''),
    ).length;
    const massEncryption =
      encryptedCount >= 3 && timeSpanSeconds <= this.RAPID_OPERATION_WINDOW_SECONDS;

    // Check for rapid deletion (data destruction)
    const deletedCount = events.filter((e) => e.changeType === 'DELETED').length;
    const rapidDeletion =
      deletedCount >= 5 && timeSpanSeconds <= this.RAPID_OPERATION_WINDOW_SECONDS;

    return {
      isMassOperation,
      massEncryption,
      rapidDeletion,
      velocity,
    };
  }

  /**
   * Analyze individual file change event
   */
  private analyzeFileChange(
    event: FileChangeDto,
    batchContext: { isMassOperation: boolean; massEncryption: boolean; rapidDeletion: boolean; velocity: number },
  ): {
    suspicious: boolean;
    threats: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    flagged: boolean;
    flaggedReason?: string;
    suspiciousExtension: boolean;
    fileCategory: string;
    sensitiveFile: boolean;
  } {
    const threats: string[] = [];
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    const extension = (event.fileExtension || '').toLowerCase();

    // Check for ransomware extensions
    const suspiciousExtension = this.ransomwareExtensions.has(extension);
    if (suspiciousExtension) {
      threats.push('Ransomware Extension Detected');
      riskLevel = 'CRITICAL';
    }

    // Check for mass encryption pattern
    if (batchContext.massEncryption) {
      threats.push('Mass Encryption Pattern (Ransomware)');
      riskLevel = 'CRITICAL';
    }

    // Check for rapid deletion
    if (batchContext.rapidDeletion) {
      threats.push('Mass File Deletion (Data Destruction)');
      riskLevel = this.escalateRisk(riskLevel, 'HIGH');
    }

    // Check for suspicious executables in sensitive directories
    if (
      this.suspiciousExecutables.has(extension) &&
      (event.filePath.includes('\\Documents\\') ||
        event.filePath.includes('\\Desktop\\') ||
        event.filePath.includes('\\Downloads\\'))
    ) {
      threats.push('Executable in Sensitive Directory');
      riskLevel = this.escalateRisk(riskLevel, 'MEDIUM');
    }

    // Check for high velocity operations
    if (batchContext.velocity > this.HIGH_VELOCITY_THRESHOLD) {
      threats.push(`High Operation Velocity (${batchContext.velocity.toFixed(1)}/s)`);
      riskLevel = this.escalateRisk(riskLevel, 'MEDIUM');
    }

    // Determine file category
    let fileCategory = 'UNKNOWN';
    const sensitiveFile = this.sensitiveExtensions.has(extension);

    if (this.sensitiveExtensions.has(extension)) {
      fileCategory = 'DOCUMENT';
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(extension)) {
      fileCategory = 'IMAGE';
    } else if (['.mp4', '.avi', '.mkv', '.mov'].includes(extension)) {
      fileCategory = 'VIDEO';
    } else if (this.archiveExtensions.has(extension)) {
      fileCategory = 'ARCHIVE';
    } else if (this.suspiciousExecutables.has(extension)) {
      fileCategory = 'EXECUTABLE';
    } else if (['.db', '.sql', '.json', '.xml', '.csv'].includes(extension)) {
      fileCategory = 'DATA';
    }

    // Flag if sensitive file with suspicious activity
    if (
      sensitiveFile &&
      (event.changeType === 'DELETED' || batchContext.isMassOperation)
    ) {
      threats.push('Sensitive File Operation');
      riskLevel = this.escalateRisk(riskLevel, 'MEDIUM');
    }

    // Determine if flagged
    const suspicious = threats.length > 0;
    const flagged = riskLevel === 'HIGH' || riskLevel === 'CRITICAL';

    let flaggedReason: string | undefined;
    if (flagged) {
      flaggedReason = `${riskLevel} RISK: ${threats.join(', ')}`;
    }

    return {
      suspicious,
      threats,
      riskLevel,
      flagged,
      flaggedReason,
      suspiciousExtension,
      fileCategory,
      sensitiveFile,
    };
  }

  /**
   * Extract path information
   */
  private extractPathInfo(filePath: string): {
    directory: string;
    fileName: string;
  } {
    const pathSeparator = filePath.includes('/') ? '/' : '\\';
    const parts = filePath.split(pathSeparator);
    const fileName = parts[parts.length - 1] || '';
    const directory = parts[parts.length - 2] || '';

    return { directory, fileName };
  }

  /**
   * Escalate risk level if new risk is higher
   */
  private escalateRisk(
    current: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    newRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const riskOrder = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    return riskOrder[newRisk] > riskOrder[current] ? newRisk : current;
  }

  /**
   * Get file events for a device
   */
  async getDeviceFileEvents(
    deviceId: string,
    tenantId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ events: FileChangeEvent[]; total: number }> {
    const [events, total] = await this.fileEventRepository.findAndCount({
      where: { deviceId, tenantId },
      order: { detectedAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { events, total };
  }

  /**
   * Get flagged file events (suspicious activity)
   */
  async getFlaggedFileEvents(
    tenantId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ events: FileChangeEvent[]; total: number }> {
    const queryBuilder = this.fileEventRepository
      .createQueryBuilder('event')
      .where('event.tenantId = :tenantId', { tenantId })
      .andWhere("event.metadata->>'flagged' = 'true'")
      .orderBy('event.detectedAt', 'DESC')
      .take(limit)
      .skip(offset);

    const [events, total] = await queryBuilder.getManyAndCount();

    return { events, total };
  }

  /**
   * Search file events by file path
   */
  async searchFileEvents(
    tenantId: string,
    searchTerm: string,
    limit = 100,
  ): Promise<FileChangeEvent[]> {
    return this.fileEventRepository
      .createQueryBuilder('event')
      .where('event.tenantId = :tenantId', { tenantId })
      .andWhere('LOWER(event.filePath) LIKE LOWER(:searchTerm)', {
        searchTerm: `%${searchTerm}%`,
      })
      .orderBy('event.detectedAt', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Get file event statistics
   */
  async getStatistics(
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalEvents: number;
    flaggedEvents: number;
    changeTypeBreakdown: Record<string, number>;
    fileTypeBreakdown: Record<string, number>;
    ransomwareIndicators: number;
    massOperations: number;
    topDirectories: Array<{ directory: string; count: number }>;
    velocityMetrics: {
      averageVelocity: number;
      maxVelocity: number;
      highVelocityBatches: number;
    };
  }> {
    const whereClause: any = { tenantId };

    if (startDate && endDate) {
      whereClause.detectedAt = Between(startDate, endDate);
    }

    // Total events
    const totalEvents = await this.fileEventRepository.count({
      where: whereClause,
    });

    // Flagged events
    const flaggedEvents = await this.fileEventRepository
      .createQueryBuilder('event')
      .where('event.tenantId = :tenantId', { tenantId })
      .andWhere("event.metadata->>'flagged' = 'true'")
      .getCount();

    // Change type breakdown
    const changeTypeResult = await this.fileEventRepository
      .createQueryBuilder('event')
      .select('event.changeType', 'changeType')
      .addSelect('COUNT(*)', 'count')
      .where('event.tenantId = :tenantId', { tenantId })
      .groupBy('event.changeType')
      .getRawMany();

    const changeTypeBreakdown: Record<string, number> = {};
    changeTypeResult.forEach((r) => {
      changeTypeBreakdown[r.changeType] = parseInt(r.count, 10);
    });

    // File type breakdown
    const fileTypeResult = await this.fileEventRepository
      .createQueryBuilder('event')
      .select('event.fileExtension', 'extension')
      .addSelect('COUNT(*)', 'count')
      .where('event.tenantId = :tenantId', { tenantId })
      .groupBy('event.fileExtension')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    const fileTypeBreakdown: Record<string, number> = {};
    fileTypeResult.forEach((r) => {
      if (r.extension) {
        fileTypeBreakdown[r.extension] = parseInt(r.count, 10);
      }
    });

    // Ransomware indicators
    const ransomwareIndicators = await this.fileEventRepository
      .createQueryBuilder('event')
      .where('event.tenantId = :tenantId', { tenantId })
      .andWhere("event.metadata->>'massEncryption' = 'true'")
      .getCount();

    // Mass operations
    const massOperations = await this.fileEventRepository
      .createQueryBuilder('event')
      .where('event.tenantId = :tenantId', { tenantId })
      .andWhere("event.metadata->>'partOfMassOperation' = 'true'")
      .getCount();

    // Top directories
    const directoryResult = await this.fileEventRepository
      .createQueryBuilder('event')
      .select("event.metadata->>'directory'", 'directory')
      .addSelect('COUNT(*)', 'count')
      .where('event.tenantId = :tenantId', { tenantId })
      .groupBy('directory')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    const topDirectories = directoryResult.map((r) => ({
      directory: r.directory || 'Unknown',
      count: parseInt(r.count, 10),
    }));

    // Velocity metrics
    const velocityResult = await this.fileEventRepository
      .createQueryBuilder('event')
      .select("AVG((event.metadata->>'operationVelocity')::numeric)", 'avg')
      .addSelect("MAX((event.metadata->>'operationVelocity')::numeric)", 'max')
      .where('event.tenantId = :tenantId', { tenantId })
      .getRawOne();

    const highVelocityBatches = await this.fileEventRepository
      .createQueryBuilder('event')
      .where('event.tenantId = :tenantId', { tenantId })
      .andWhere(
        "(event.metadata->>'operationVelocity')::numeric > :threshold",
        { threshold: this.HIGH_VELOCITY_THRESHOLD },
      )
      .select('DISTINCT event.batchId')
      .getRawMany();

    return {
      totalEvents,
      flaggedEvents,
      changeTypeBreakdown,
      fileTypeBreakdown,
      ransomwareIndicators,
      massOperations,
      topDirectories,
      velocityMetrics: {
        averageVelocity: parseFloat(velocityResult?.avg || '0'),
        maxVelocity: parseFloat(velocityResult?.max || '0'),
        highVelocityBatches: highVelocityBatches.length,
      },
    };
  }
}
