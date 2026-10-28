import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Evidence, EvidenceStatus, EvidenceType } from './entities/evidence.entity';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);
  private readonly storageBasePath: string;

  constructor(
    @InjectRepository(Evidence)
    private evidenceRepository: Repository<Evidence>,
  ) {
    // Configure storage path (could be moved to config)
    this.storageBasePath = process.env.EVIDENCE_STORAGE_PATH || './storage/evidence';
    this.ensureStorageDirectory();
  }

  private async ensureStorageDirectory() {
    try {
      await fs.mkdir(this.storageBasePath, { recursive: true });
      this.logger.log(`Evidence storage directory: ${this.storageBasePath}`);
    } catch (error) {
      this.logger.error(`Failed to create evidence storage directory: ${error.message}`);
    }
  }

  /**
   * Generate unique bundle ID
   * Format: FB-YYYYMMDD-XXXX
   */
  private generateBundleId(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `FB-${dateStr}-${random}`;
  }

  /**
   * Calculate SHA256 hash of a file
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Store uploaded forensic bundle
   */
  async storeForensicBundle(
    deviceId: string,
    file: Express.Multer.File,
    metadata: {
      commandId?: string;
      hardwareHash?: string;
      artifactCount?: number;
      collectionDurationMs?: number;
      deviceName?: string;
    },
  ): Promise<Evidence> {
    this.logger.log(`Storing forensic bundle from device ${deviceId}`);

    // Generate unique bundle ID
    const bundleId = this.generateBundleId();

    // Create device-specific subdirectory
    const deviceDir = path.join(this.storageBasePath, deviceId);
    await fs.mkdir(deviceDir, { recursive: true });

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `forensic-bundle-${timestamp}.zip`;
    const storagePath = path.join(deviceDir, filename);

    // Move file to permanent storage
    await fs.writeFile(storagePath, file.buffer);
    this.logger.log(`Bundle saved to: ${storagePath}`);

    // Calculate file hash for integrity
    const sha256Hash = await this.calculateFileHash(storagePath);

    // Create evidence record
    const evidence = this.evidenceRepository.create({
      bundleId,
      type: EvidenceType.FORENSIC_BUNDLE,
      status: EvidenceStatus.UPLOADED,
      deviceId,
      commandId: metadata.commandId,
      filename,
      storagePath,
      sizeBytes: file.size,
      mimeType: file.mimetype || 'application/zip',
      sha256Hash,
      hardwareHash: metadata.hardwareHash,
      artifactCount: metadata.artifactCount || 0,
      collectionDurationMs: metadata.collectionDurationMs,
      metadata: {
        machineName: metadata.deviceName,
        collectionCompleted: new Date().toISOString(),
      },
      chainOfCustody: [
        {
          timestamp: new Date().toISOString(),
          userId: 'SYSTEM',
          userName: 'Agent Upload',
          action: 'UPLOADED',
          reason: 'Forensic diagnostic bundle collected by agent',
        },
      ],
      retentionDays: 365,
      scheduledDeletionAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });

    const savedEvidence = await this.evidenceRepository.save(evidence);

    this.logger.log(
      `Forensic bundle ${bundleId} stored successfully - ${file.size} bytes, ${metadata.artifactCount} artifacts`,
    );

    return savedEvidence;
  }

  /**
   * Find evidence by bundle ID
   */
  async findByBundleId(bundleId: string): Promise<Evidence> {
    const evidence = await this.evidenceRepository.findOne({
      where: { bundleId },
      relations: ['device'],
    });

    if (!evidence) {
      throw new NotFoundException(`Evidence bundle ${bundleId} not found`);
    }

    return evidence;
  }

  /**
   * Find all evidence for a device
   */
  async findByDevice(deviceId: string): Promise<Evidence[]> {
    return this.evidenceRepository.find({
      where: { deviceId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get evidence file stream for download
   */
  async getEvidenceFile(bundleId: string): Promise<{ path: string; evidence: Evidence }> {
    const evidence = await this.findByBundleId(bundleId);

    // Verify file exists
    try {
      await fs.access(evidence.storagePath);
    } catch (error) {
      throw new NotFoundException(`Evidence file not found at ${evidence.storagePath}`);
    }

    return { path: evidence.storagePath, evidence };
  }

  /**
   * Add chain of custody entry
   */
  async addChainOfCustodyEntry(
    bundleId: string,
    entry: {
      userId: string;
      userName: string;
      action: 'UPLOADED' | 'ACCESSED' | 'DOWNLOADED' | 'ANALYZED' | 'ARCHIVED' | 'DELETED';
      ipAddress?: string;
      reason?: string;
    },
  ): Promise<Evidence> {
    const evidence = await this.findByBundleId(bundleId);

    evidence.chainOfCustody.push({
      timestamp: new Date().toISOString(),
      ...entry,
    });

    return this.evidenceRepository.save(evidence);
  }

  /**
   * Update evidence status
   */
  async updateStatus(bundleId: string, status: EvidenceStatus): Promise<Evidence> {
    const evidence = await this.findByBundleId(bundleId);
    evidence.status = status;
    return this.evidenceRepository.save(evidence);
  }

  /**
   * List all evidence with pagination
   */
  async findAll(page = 1, limit = 50): Promise<{ data: Evidence[]; total: number; page: number; pages: number }> {
    const [data, total] = await this.evidenceRepository.findAndCount({
      relations: ['device'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Get evidence statistics
   */
  async getStatistics(): Promise<{
    totalBundles: number;
    totalSizeBytes: number;
    bundlesByStatus: Record<string, number>;
    recentUploads: Evidence[];
  }> {
    const totalBundles = await this.evidenceRepository.count();

    const sizeResult = await this.evidenceRepository
      .createQueryBuilder('evidence')
      .select('SUM(evidence.sizeBytes)', 'total')
      .getRawOne();

    const statusResult = await this.evidenceRepository
      .createQueryBuilder('evidence')
      .select('evidence.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('evidence.status')
      .getRawMany();

    const bundlesByStatus = statusResult.reduce(
      (acc, row) => {
        acc[row.status] = parseInt(row.count, 10);
        return acc;
      },
      {} as Record<string, number>,
    );

    const recentUploads = await this.evidenceRepository.find({
      relations: ['device'],
      order: { createdAt: 'DESC' },
      take: 10,
    });

    return {
      totalBundles,
      totalSizeBytes: parseInt(sizeResult?.total || '0', 10),
      bundlesByStatus,
      recentUploads,
    };
  }
}
