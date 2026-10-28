import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  Body,
  Res,
  Logger,
  ParseIntPipe,
  DefaultValuePipe,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { EvidenceService } from './evidence.service';
import * as fs from 'fs';

@Controller('evidence')
export class EvidenceController {
  private readonly logger = new Logger(EvidenceController.name);

  constructor(private readonly evidenceService: EvidenceService) {}

  /**
   * Upload forensic bundle from agent
   * POST /evidence/bundle
   */
  @Post('bundle')
  @UseInterceptors(FileInterceptor('bundle'))
  async uploadBundle(
    @UploadedFile() file: Express.Multer.File,
    @Body('deviceId') deviceId: string,
    @Body('commandId') commandId: string,
    @Body('hardwareHash') hardwareHash: string,
    @Body('deviceName') deviceName: string,
    @Body('artifactCount') artifactCount: string,
    @Request() req: { headers?: { 'x-device-key'?: string; 'x-device-secret'?: string } },
  ) {
    // Verify device credentials (basic validation)
    const deviceKey = req.headers?.['x-device-key'];
    const deviceSecret = req.headers?.['x-device-secret'];

    if (!deviceKey || !deviceSecret) {
      throw new BadRequestException('Device credentials required');
    }

    this.logger.log(`Receiving forensic bundle upload from device ${deviceId}`);

    if (!file) {
      return {
        success: false,
        error: 'No file uploaded',
      };
    }

    try {
      const evidence = await this.evidenceService.storeForensicBundle(deviceId, file, {
        commandId,
        hardwareHash,
        artifactCount: parseInt(artifactCount || '0', 10),
        deviceName,
      });

      this.logger.log(
        `Forensic bundle ${evidence.bundleId} uploaded successfully - ${file.size} bytes`,
      );

      return {
        success: true,
        bundleId: evidence.bundleId,
        evidenceId: evidence.id,
        sizeBytes: evidence.sizeBytes,
        artifactCount: evidence.artifactCount,
        sha256Hash: evidence.sha256Hash,
        uploadedAt: evidence.createdAt,
      };
    } catch (error) {
      this.logger.error(`Failed to store forensic bundle: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get evidence by bundle ID
   * GET /evidence/:bundleId
   */
  @Get(':bundleId')
  async getEvidence(@Param('bundleId') bundleId: string) {
    const evidence = await this.evidenceService.findByBundleId(bundleId);

    return {
      success: true,
      evidence: {
        id: evidence.id,
        bundleId: evidence.bundleId,
        type: evidence.type,
        status: evidence.status,
        deviceId: evidence.deviceId,
        filename: evidence.filename,
        sizeBytes: evidence.sizeBytes,
        artifactCount: evidence.artifactCount,
        hardwareHash: evidence.hardwareHash,
        sha256Hash: evidence.sha256Hash,
        metadata: evidence.metadata,
        chainOfCustody: evidence.chainOfCustody,
        createdAt: evidence.createdAt,
        updatedAt: evidence.updatedAt,
      },
    };
  }

  /**
   * Download evidence file
   * GET /evidence/:bundleId/download
   */
  @Get(':bundleId/download')
  async downloadEvidence(@Param('bundleId') bundleId: string, @Res() res: Response) {
    this.logger.log(`Download request for bundle ${bundleId}`);

    const { path: filePath, evidence } = await this.evidenceService.getEvidenceFile(bundleId);

    // Add chain of custody entry
    await this.evidenceService.addChainOfCustodyEntry(bundleId, {
      userId: 'SYSTEM', // TODO: Get from authenticated user
      userName: 'Dashboard User',
      action: 'DOWNLOADED',
      reason: 'Evidence download via API',
    });

    // Stream file to response
    res.setHeader('Content-Type', evidence.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${evidence.filename}"`);
    res.setHeader('Content-Length', evidence.sizeBytes.toString());

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  }

  /**
   * Get all evidence for a device
   * GET /evidence/device/:deviceId
   */
  @Get('device/:deviceId')
  async getDeviceEvidence(@Param('deviceId') deviceId: string) {
    const evidence = await this.evidenceService.findByDevice(deviceId);

    return {
      success: true,
      count: evidence.length,
      evidence: evidence.map((e) => ({
        id: e.id,
        bundleId: e.bundleId,
        type: e.type,
        status: e.status,
        filename: e.filename,
        sizeBytes: e.sizeBytes,
        artifactCount: e.artifactCount,
        createdAt: e.createdAt,
      })),
    };
  }

  /**
   * List all evidence with pagination
   * GET /evidence
   */
  @Get()
  async listEvidence(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const result = await this.evidenceService.findAll(page, limit);

    return {
      success: true,
      ...result,
    };
  }

  /**
   * Get evidence statistics
   * GET /evidence/stats/summary
   */
  @Get('stats/summary')
  async getStatistics() {
    const stats = await this.evidenceService.getStatistics();

    return {
      success: true,
      statistics: stats,
    };
  }
}
