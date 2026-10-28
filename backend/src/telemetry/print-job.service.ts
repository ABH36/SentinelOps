import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { PrintJob } from '../database/entities/print-job.entity';

export interface SubmitPrintJobDto {
  jobId: number;
  documentName: string;
  printerName: string;
  owner: string;
  totalPages: number;
  jobStatus?: string;
  dataType?: string;
  driverName?: string;
  fileSize?: number;
  timeSubmitted: string;
  detectedAt: string;
}

@Injectable()
export class PrintJobService {
  private readonly logger = new Logger(PrintJobService.name);

  // Sensitive document patterns for DLP analysis
  private readonly sensitivePatterns = {
    confidential: /confidential|secret|private|restricted|internal\s+only/gi,
    financial: /invoice|payroll|salary|financial|budget|revenue|profit|loss|tax|balance\s+sheet|income\s+statement/gi,
    medical: /patient|medical|health|diagnosis|prescription|hipaa|phi|clinical/gi,
    legal: /contract|agreement|nda|legal|lawsuit|litigation|attorney|settlement/gi,
    personal: /ssn|social\s+security|passport|driver.*license|credit\s+card|bank\s+account/gi,
    credentials: /password|credential|api\s+key|secret\s+key|access\s+token|private\s+key/gi,
  };

  // Personal/risky printers (data exfiltration risk)
  private readonly personalPrinters = /pdf|xps|onenote|fax|scan.*email|dropbox|google\s+drive/gi;

  // Large corporation document indicators
  private readonly corporatePatterns = /quarterly|annual\s+report|earnings|board|executive|confidential|proprietary/gi;

  constructor(
    @InjectRepository(PrintJob)
    private printJobRepository: Repository<PrintJob>,
  ) {}

  /**
   * Submit print job from agent
   */
  async submitPrintJob(
    deviceId: string,
    tenantId: string,
    dto: SubmitPrintJobDto,
  ): Promise<{ saved: boolean; flagged: boolean; riskLevel: string }> {
    this.logger.debug(
      `Print job from device ${deviceId}: ${dto.documentName} (${dto.totalPages} pages)`,
    );

    try {
      // Analyze document for sensitive content
      const analysis = this.analyzeDocument(
        dto.documentName,
        dto.printerName,
        dto.totalPages,
        dto.owner,
        new Date(dto.timeSubmitted),
      );

      // Create print job entry
      const printJob = this.printJobRepository.create({
        deviceId,
        tenantId,
        jobId: dto.jobId,
        documentName: dto.documentName,
        printerName: dto.printerName,
        owner: dto.owner,
        totalPages: dto.totalPages,
        jobStatus: dto.jobStatus || 'Unknown',
        dataType: dto.dataType,
        driverName: dto.driverName,
        fileSize: dto.fileSize || 0,
        timeSubmitted: new Date(dto.timeSubmitted),
        detectedAt: new Date(dto.detectedAt),
        metadata: {
          containsSensitivePatterns: analysis.containsSensitivePatterns,
          detectedPatterns: analysis.detectedPatterns,
          riskLevel: analysis.riskLevel,
          flagged: analysis.flagged,
          flaggedReason: analysis.flaggedReason,
          documentCategory: analysis.documentCategory,
          timeOfDay: analysis.timeOfDay,
          isPersonalPrinter: analysis.isPersonalPrinter,
          largeDocument: analysis.largeDocument,
          unusualHours: analysis.unusualHours,
        },
      });

      await this.printJobRepository.save(printJob);

      this.logger.info(
        `Print job saved - Device: ${deviceId}, Doc: ${dto.documentName}, Risk: ${analysis.riskLevel}, Flagged: ${analysis.flagged}`,
      );

      if (analysis.flagged) {
        this.logger.warn(
          `⚠️ Flagged print job - Device: ${deviceId}, User: ${dto.owner}, Doc: ${dto.documentName}, Reason: ${analysis.flaggedReason}`,
        );
      }

      return {
        saved: true,
        flagged: analysis.flagged,
        riskLevel: analysis.riskLevel,
      };
    } catch (error) {
      this.logger.error(
        `Failed to save print job for device ${deviceId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Analyze document for sensitive content and risk factors
   */
  private analyzeDocument(
    documentName: string,
    printerName: string,
    totalPages: number,
    owner: string,
    timeSubmitted: Date,
  ): {
    containsSensitivePatterns: boolean;
    detectedPatterns: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    flagged: boolean;
    flaggedReason?: string;
    documentCategory: 'FINANCIAL' | 'CONFIDENTIAL' | 'MEDICAL' | 'LEGAL' | 'PERSONAL' | 'BUSINESS' | 'OTHER';
    timeOfDay: 'BUSINESS_HOURS' | 'AFTER_HOURS' | 'WEEKEND';
    isPersonalPrinter: boolean;
    largeDocument: boolean;
    unusualHours: boolean;
  } {
    const docNameLower = documentName.toLowerCase();
    const detectedPatterns: string[] = [];
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    let documentCategory: 'FINANCIAL' | 'CONFIDENTIAL' | 'MEDICAL' | 'LEGAL' | 'PERSONAL' | 'BUSINESS' | 'OTHER' = 'OTHER';

    // Check for sensitive patterns
    if (this.sensitivePatterns.confidential.test(docNameLower)) {
      detectedPatterns.push('Confidential Document');
      documentCategory = 'CONFIDENTIAL';
      riskLevel = 'HIGH';
    }

    if (this.sensitivePatterns.financial.test(docNameLower)) {
      detectedPatterns.push('Financial Information');
      if (documentCategory === 'OTHER') documentCategory = 'FINANCIAL';
      riskLevel = this.escalateRisk(riskLevel, 'HIGH');
    }

    if (this.sensitivePatterns.medical.test(docNameLower)) {
      detectedPatterns.push('Medical/Health Information');
      if (documentCategory === 'OTHER') documentCategory = 'MEDICAL';
      riskLevel = this.escalateRisk(riskLevel, 'CRITICAL');
    }

    if (this.sensitivePatterns.legal.test(docNameLower)) {
      detectedPatterns.push('Legal Document');
      if (documentCategory === 'OTHER') documentCategory = 'LEGAL';
      riskLevel = this.escalateRisk(riskLevel, 'HIGH');
    }

    if (this.sensitivePatterns.personal.test(docNameLower)) {
      detectedPatterns.push('Personal Information (PII)');
      if (documentCategory === 'OTHER') documentCategory = 'PERSONAL';
      riskLevel = this.escalateRisk(riskLevel, 'CRITICAL');
    }

    if (this.sensitivePatterns.credentials.test(docNameLower)) {
      detectedPatterns.push('Credentials/Secrets');
      riskLevel = 'CRITICAL';
    }

    if (this.corporatePatterns.test(docNameLower)) {
      detectedPatterns.push('Corporate Document');
      if (documentCategory === 'OTHER') documentCategory = 'BUSINESS';
      riskLevel = this.escalateRisk(riskLevel, 'MEDIUM');
    }

    // Check printer type (data exfiltration risk)
    const isPersonalPrinter = this.personalPrinters.test(printerName);
    if (isPersonalPrinter && detectedPatterns.length > 0) {
      detectedPatterns.push('Print to File/PDF (Data Exfiltration Risk)');
      riskLevel = this.escalateRisk(riskLevel, 'HIGH');
    }

    // Check document size
    const largeDocument = totalPages > 50;
    if (largeDocument && detectedPatterns.length > 0) {
      detectedPatterns.push('Large Document (>50 pages)');
      riskLevel = this.escalateRisk(riskLevel, 'MEDIUM');
    }

    // Check time of day
    const hour = timeSubmitted.getHours();
    const dayOfWeek = timeSubmitted.getDay(); // 0 = Sunday, 6 = Saturday

    let timeOfDay: 'BUSINESS_HOURS' | 'AFTER_HOURS' | 'WEEKEND' = 'BUSINESS_HOURS';
    let unusualHours = false;

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      timeOfDay = 'WEEKEND';
      unusualHours = true;
    } else if (hour < 7 || hour >= 19) {
      timeOfDay = 'AFTER_HOURS';
      unusualHours = true;
    }

    if (unusualHours && detectedPatterns.length > 0) {
      detectedPatterns.push('Printed Outside Business Hours');
      riskLevel = this.escalateRisk(riskLevel, 'MEDIUM');
    }

    // Determine if flagged
    const containsSensitivePatterns = detectedPatterns.length > 0;
    const flagged =
      riskLevel === 'HIGH' ||
      riskLevel === 'CRITICAL' ||
      (isPersonalPrinter && containsSensitivePatterns) ||
      (unusualHours && containsSensitivePatterns);

    let flaggedReason: string | undefined;
    if (flagged) {
      if (riskLevel === 'CRITICAL') {
        flaggedReason = `CRITICAL RISK: ${detectedPatterns.join(', ')}`;
      } else if (riskLevel === 'HIGH') {
        flaggedReason = `HIGH RISK: ${detectedPatterns.join(', ')}`;
      } else {
        flaggedReason = `Potential data loss: ${detectedPatterns.join(', ')}`;
      }
    }

    return {
      containsSensitivePatterns,
      detectedPatterns,
      riskLevel,
      flagged,
      flaggedReason,
      documentCategory,
      timeOfDay,
      isPersonalPrinter,
      largeDocument,
      unusualHours,
    };
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
   * Get print jobs for a device
   */
  async getDevicePrintJobs(
    deviceId: string,
    tenantId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ jobs: PrintJob[]; total: number }> {
    const [jobs, total] = await this.printJobRepository.findAndCount({
      where: { deviceId, tenantId },
      order: { timeSubmitted: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { jobs, total };
  }

  /**
   * Get flagged print jobs (high risk)
   */
  async getFlaggedPrintJobs(
    tenantId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ jobs: PrintJob[]; total: number }> {
    const queryBuilder = this.printJobRepository
      .createQueryBuilder('job')
      .where('job.tenantId = :tenantId', { tenantId })
      .andWhere("job.metadata->>'flagged' = 'true'")
      .orderBy('job.timeSubmitted', 'DESC')
      .take(limit)
      .skip(offset);

    const [jobs, total] = await queryBuilder.getManyAndCount();

    return { jobs, total };
  }

  /**
   * Search print jobs by document name or owner
   */
  async searchPrintJobs(
    tenantId: string,
    searchTerm: string,
    limit = 100,
  ): Promise<PrintJob[]> {
    return this.printJobRepository
      .createQueryBuilder('job')
      .where('job.tenantId = :tenantId', { tenantId })
      .andWhere(
        '(LOWER(job.documentName) LIKE LOWER(:searchTerm) OR LOWER(job.owner) LIKE LOWER(:searchTerm) OR LOWER(job.printerName) LIKE LOWER(:searchTerm))',
        { searchTerm: `%${searchTerm}%` },
      )
      .orderBy('job.timeSubmitted', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Get print job statistics
   */
  async getStatistics(
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalJobs: number;
    totalPages: number;
    flaggedJobs: number;
    uniqueUsers: number;
    uniquePrinters: number;
    riskBreakdown: Record<string, number>;
    categoryBreakdown: Record<string, number>;
    printerBreakdown: Record<string, number>;
    topUsers: Array<{ owner: string; jobCount: number; pageCount: number }>;
    afterHoursJobs: number;
    personalPrinterJobs: number;
  }> {
    const whereClause: any = { tenantId };

    if (startDate && endDate) {
      whereClause.timeSubmitted = Between(startDate, endDate);
    }

    // Total jobs and pages
    const totalResult = await this.printJobRepository
      .createQueryBuilder('job')
      .select('COUNT(*)', 'totalJobs')
      .addSelect('SUM(job.totalPages)', 'totalPages')
      .where('job.tenantId = :tenantId', { tenantId })
      .getRawOne();

    const totalJobs = parseInt(totalResult?.totalJobs || '0', 10);
    const totalPages = parseInt(totalResult?.totalPages || '0', 10);

    // Flagged jobs
    const flaggedJobs = await this.printJobRepository
      .createQueryBuilder('job')
      .where('job.tenantId = :tenantId', { tenantId })
      .andWhere("job.metadata->>'flagged' = 'true'")
      .getCount();

    // Unique users
    const uniqueUsersResult = await this.printJobRepository
      .createQueryBuilder('job')
      .select('COUNT(DISTINCT job.owner)', 'count')
      .where('job.tenantId = :tenantId', { tenantId })
      .getRawOne();

    const uniqueUsers = parseInt(uniqueUsersResult?.count || '0', 10);

    // Unique printers
    const uniquePrintersResult = await this.printJobRepository
      .createQueryBuilder('job')
      .select('COUNT(DISTINCT job.printerName)', 'count')
      .where('job.tenantId = :tenantId', { tenantId })
      .getRawOne();

    const uniquePrinters = parseInt(uniquePrintersResult?.count || '0', 10);

    // Risk breakdown
    const riskResult = await this.printJobRepository
      .createQueryBuilder('job')
      .select("job.metadata->>'riskLevel'", 'riskLevel')
      .addSelect('COUNT(*)', 'count')
      .where('job.tenantId = :tenantId', { tenantId })
      .groupBy('riskLevel')
      .getRawMany();

    const riskBreakdown: Record<string, number> = {};
    riskResult.forEach((r) => {
      if (r.riskLevel) {
        riskBreakdown[r.riskLevel] = parseInt(r.count, 10);
      }
    });

    // Category breakdown
    const categoryResult = await this.printJobRepository
      .createQueryBuilder('job')
      .select("job.metadata->>'documentCategory'", 'category')
      .addSelect('COUNT(*)', 'count')
      .where('job.tenantId = :tenantId', { tenantId })
      .groupBy('category')
      .getRawMany();

    const categoryBreakdown: Record<string, number> = {};
    categoryResult.forEach((r) => {
      if (r.category) {
        categoryBreakdown[r.category] = parseInt(r.count, 10);
      }
    });

    // Printer breakdown (top 10)
    const printerResult = await this.printJobRepository
      .createQueryBuilder('job')
      .select('job.printerName', 'printer')
      .addSelect('COUNT(*)', 'count')
      .where('job.tenantId = :tenantId', { tenantId })
      .groupBy('job.printerName')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    const printerBreakdown: Record<string, number> = {};
    printerResult.forEach((r) => {
      printerBreakdown[r.printer] = parseInt(r.count, 10);
    });

    // Top users
    const topUsersResult = await this.printJobRepository
      .createQueryBuilder('job')
      .select('job.owner', 'owner')
      .addSelect('COUNT(*)', 'jobCount')
      .addSelect('SUM(job.totalPages)', 'pageCount')
      .where('job.tenantId = :tenantId', { tenantId })
      .groupBy('job.owner')
      .orderBy('jobCount', 'DESC')
      .limit(10)
      .getRawMany();

    const topUsers = topUsersResult.map((r) => ({
      owner: r.owner,
      jobCount: parseInt(r.jobCount, 10),
      pageCount: parseInt(r.pageCount || '0', 10),
    }));

    // After hours jobs
    const afterHoursJobs = await this.printJobRepository
      .createQueryBuilder('job')
      .where('job.tenantId = :tenantId', { tenantId })
      .andWhere("job.metadata->>'unusualHours' = 'true'")
      .getCount();

    // Personal printer jobs
    const personalPrinterJobs = await this.printJobRepository
      .createQueryBuilder('job')
      .where('job.tenantId = :tenantId', { tenantId })
      .andWhere("job.metadata->>'isPersonalPrinter' = 'true'")
      .getCount();

    return {
      totalJobs,
      totalPages,
      flaggedJobs,
      uniqueUsers,
      uniquePrinters,
      riskBreakdown,
      categoryBreakdown,
      printerBreakdown,
      topUsers,
      afterHoursJobs,
      personalPrinterJobs,
    };
  }
}
