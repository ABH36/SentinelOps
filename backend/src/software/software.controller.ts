import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { SoftwareService } from './software.service';
import { CreatePackageDto } from './dtos/create-package.dto';
import { DeployPackageDto, UninstallPackageDto } from './dtos/deploy-package.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PackageStatus } from '../database/entities/software-package.entity';
import { DeploymentStatus } from '../database/entities/software-deployment.entity';

@Controller('software')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SoftwareController {
  constructor(private readonly softwareService: SoftwareService) {}

  // ==================== Package Endpoints ====================

  /**
   * POST /software/packages
   * Upload and create a new software package
   */
  @Post('packages')
  @RequirePermissions('software.manage')
  @UseInterceptors(FileInterceptor('file'))
  async createPackage(
    @Body() dto: CreatePackageDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    // If file is uploaded, add file metadata to the DTO
    if (file) {
      dto.metadata = {
        ...dto.metadata,
        fileSize: file.size,
        // In production, upload to S3/Azure Blob and store the URL
        fileUrl: `/uploads/${file.filename}`,
        // Calculate hash in production
        fileHash: 'sha256-placeholder',
      };
    }

    const pkg = await this.softwareService.createPackage(tenantId, userId, dto);

    return {
      success: true,
      data: pkg,
      message: 'Software package created successfully',
    };
  }

  /**
   * GET /software/packages
   * List all software packages with optional filters
   */
  @Get('packages')
  @RequirePermissions('software.read')
  async getPackages(
    @CurrentUser('tenantId') tenantId: string,
    @Query('platform') platform?: string,
    @Query('status') status?: PackageStatus,
    @Query('search') search?: string,
  ) {
    const packages = await this.softwareService.getPackages(tenantId, {
      platform,
      status,
      search,
    });

    return {
      success: true,
      data: packages,
      count: packages.length,
    };
  }

  /**
   * GET /software/packages/:id
   * Get details of a specific package
   */
  @Get('packages/:id')
  @RequirePermissions('software.read')
  async getPackageById(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const pkg = await this.softwareService.getPackageById(tenantId, id);

    return {
      success: true,
      data: pkg,
    };
  }

  /**
   * PUT /software/packages/:id
   * Update package details
   */
  @Put('packages/:id')
  @RequirePermissions('software.manage')
  async updatePackage(
    @Param('id') id: string,
    @Body() dto: Partial<CreatePackageDto>,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    const pkg = await this.softwareService.updatePackage(tenantId, userId, id, dto);

    return {
      success: true,
      data: pkg,
      message: 'Package updated successfully',
    };
  }

  /**
   * DELETE /software/packages/:id
   * Delete a package from the catalog
   */
  @Delete('packages/:id')
  @RequirePermissions('software.manage')
  async deletePackage(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.softwareService.deletePackage(tenantId, userId, id);

    return {
      success: true,
      message: 'Package deleted successfully',
    };
  }

  // ==================== Deployment Endpoints ====================

  /**
   * POST /software/deployments
   * Deploy a package to one or more devices
   */
  @Post('deployments')
  @RequirePermissions('software.deploy')
  async deployPackage(
    @Body() dto: DeployPackageDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    const deployments = await this.softwareService.deployPackage(tenantId, userId, dto);

    return {
      success: true,
      data: deployments,
      count: deployments.length,
      message: `Package deployment initiated for ${deployments.length} device(s)`,
    };
  }

  /**
   * GET /software/deployments
   * List all deployments with optional filters
   */
  @Get('deployments')
  @RequirePermissions('software.read')
  async getDeployments(
    @CurrentUser('tenantId') tenantId: string,
    @Query('packageId') packageId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('status') status?: DeploymentStatus,
  ) {
    const deployments = await this.softwareService.getDeployments(tenantId, {
      packageId,
      deviceId,
      status,
    });

    return {
      success: true,
      data: deployments,
      count: deployments.length,
    };
  }

  /**
   * GET /software/deployments/:id
   * Get details of a specific deployment
   */
  @Get('deployments/:id')
  @RequirePermissions('software.read')
  async getDeploymentById(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const deployment = await this.softwareService.getDeploymentById(tenantId, id);

    return {
      success: true,
      data: deployment,
    };
  }

  /**
   * POST /software/deployments/:id/cancel
   * Cancel a pending or scheduled deployment
   */
  @Post('deployments/:id/cancel')
  @RequirePermissions('software.deploy')
  async cancelDeployment(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.softwareService.cancelDeployment(tenantId, userId, id);

    return {
      success: true,
      message: 'Deployment cancelled successfully',
    };
  }

  /**
   * POST /software/uninstall
   * Uninstall a package from devices
   */
  @Post('uninstall')
  @RequirePermissions('software.deploy')
  async uninstallPackage(
    @Body() dto: UninstallPackageDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.softwareService.uninstallPackage(tenantId, userId, dto);

    const deviceCount = dto.deviceIds?.length || (dto.deviceId ? 1 : 0);

    return {
      success: true,
      message: `Package uninstall initiated for ${deviceCount} device(s)`,
    };
  }
}
