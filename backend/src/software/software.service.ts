import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { SoftwarePackage, PackageStatus } from '../database/entities/software-package.entity';
import { SoftwareDeployment, DeploymentStatus, DeploymentPriority } from '../database/entities/software-deployment.entity';
import { Device } from '../database/entities/device.entity';
import { CreatePackageDto } from './dtos/create-package.dto';
import { DeployPackageDto, UninstallPackageDto } from './dtos/deploy-package.dto';
import { RemoteActionsService } from '../remote-actions/remote-actions.service';
import { RemoteActionType, RemoteActionPriority } from '@shared/types/remote-action.types';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '@shared/types/audit.types';
import { EventsService } from '../events/events.service';

@Injectable()
export class SoftwareService {
  constructor(
    @InjectRepository(SoftwarePackage)
    private readonly packageRepository: Repository<SoftwarePackage>,
    @InjectRepository(SoftwareDeployment)
    private readonly deploymentRepository: Repository<SoftwareDeployment>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @Inject(forwardRef(() => RemoteActionsService))
    private readonly remoteActionsService: RemoteActionsService,
    private readonly auditService: AuditService,
    private readonly eventsService: EventsService,
  ) {}

  // ==================== Package Management ====================

  /**
   * Create a new software package
   */
  async createPackage(
    tenantId: string,
    userId: string,
    dto: CreatePackageDto,
  ): Promise<SoftwarePackage> {
    const pkg = this.packageRepository.create({
      ...dto,
      tenantId,
      createdBy: userId,
      status: dto.status || PackageStatus.DRAFT,
      downloadCount: 0,
      deploymentCount: 0,
      successRate: 0,
    });

    const saved = await this.packageRepository.save(pkg);

    await this.auditService.logEvent({
      eventType: AuditEventType.SOFTWARE_PACKAGE_CREATED,
      tenantId,
      userId,
      details: {
        packageId: saved.id,
        name: saved.name,
        version: saved.version,
        platform: saved.platform,
      },
    });

    return saved;
  }

  /**
   * Get all packages for a tenant
   */
  async getPackages(
    tenantId: string,
    filters?: {
      platform?: string;
      status?: PackageStatus;
      search?: string;
    },
  ): Promise<SoftwarePackage[]> {
    const query = this.packageRepository
      .createQueryBuilder('package')
      .where('package.tenantId = :tenantId', { tenantId });

    if (filters?.platform) {
      query.andWhere('package.platform = :platform', { platform: filters.platform });
    }

    if (filters?.status) {
      query.andWhere('package.status = :status', { status: filters.status });
    }

    if (filters?.search) {
      query.andWhere(
        '(package.name ILIKE :search OR package.description ILIKE :search OR package.publisher ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    query.orderBy('package.createdAt', 'DESC');

    return query.getMany();
  }

  /**
   * Get a single package by ID
   */
  async getPackageById(tenantId: string, packageId: string): Promise<SoftwarePackage> {
    const pkg = await this.packageRepository.findOne({
      where: { id: packageId, tenantId },
      relations: ['deployments'],
    });

    if (!pkg) {
      throw new NotFoundException('Software package not found');
    }

    return pkg;
  }

  /**
   * Update package details
   */
  async updatePackage(
    tenantId: string,
    userId: string,
    packageId: string,
    updates: Partial<CreatePackageDto>,
  ): Promise<SoftwarePackage> {
    const pkg = await this.getPackageById(tenantId, packageId);

    Object.assign(pkg, updates);
    pkg.updatedBy = userId;

    const saved = await this.packageRepository.save(pkg);

    await this.auditService.logEvent({
      eventType: AuditEventType.SOFTWARE_PACKAGE_UPDATED,
      tenantId,
      userId,
      details: {
        packageId: saved.id,
        name: saved.name,
        changes: updates,
      },
    });

    return saved;
  }

  /**
   * Delete a package (only if no active deployments)
   */
  async deletePackage(tenantId: string, userId: string, packageId: string): Promise<void> {
    const pkg = await this.getPackageById(tenantId, packageId);

    // Check for active deployments
    const activeDeployments = await this.deploymentRepository.count({
      where: {
        packageId,
        status: In([
          DeploymentStatus.PENDING,
          DeploymentStatus.SCHEDULED,
          DeploymentStatus.DOWNLOADING,
          DeploymentStatus.INSTALLING,
        ]),
      },
    });

    if (activeDeployments > 0) {
      throw new BadRequestException(
        `Cannot delete package with ${activeDeployments} active deployment(s). Cancel or complete them first.`,
      );
    }

    await this.packageRepository.remove(pkg);

    await this.auditService.logEvent({
      eventType: AuditEventType.SOFTWARE_PACKAGE_DELETED,
      tenantId,
      userId,
      details: {
        packageId,
        name: pkg.name,
        version: pkg.version,
      },
    });
  }

  // ==================== Deployment Management ====================

  /**
   * Deploy a package to one or multiple devices
   */
  async deployPackage(
    tenantId: string,
    userId: string,
    dto: DeployPackageDto,
  ): Promise<SoftwareDeployment[]> {
    const pkg = await this.getPackageById(tenantId, dto.packageId);

    if (pkg.status !== PackageStatus.READY) {
      throw new BadRequestException(
        `Package status is "${pkg.status}". Only packages with status "READY" can be deployed.`,
      );
    }

    // Determine target devices
    const deviceIds = dto.deviceIds || (dto.deviceId ? [dto.deviceId] : []);

    if (deviceIds.length === 0) {
      throw new BadRequestException('Must specify at least one device (deviceId or deviceIds)');
    }

    // Verify all devices exist and belong to tenant
    const devices = await this.deviceRepository.find({
      where: {
        id: In(deviceIds),
        tenantId,
      },
    });

    if (devices.length !== deviceIds.length) {
      throw new BadRequestException('One or more devices not found or do not belong to this tenant');
    }

    // Verify platform compatibility
    const incompatibleDevices = devices.filter((device) => {
      if (pkg.platform === 'CROSS_PLATFORM') return false;
      return device.platform.toUpperCase() !== pkg.platform;
    });

    if (incompatibleDevices.length > 0) {
      const deviceNames = incompatibleDevices.map((d) => d.deviceName).join(', ');
      throw new BadRequestException(
        `Package platform "${pkg.platform}" is incompatible with devices: ${deviceNames}`,
      );
    }

    const deployments: SoftwareDeployment[] = [];

    // Create deployment records and dispatch remote actions
    for (const device of devices) {
      // Create deployment record
      const deployment = this.deploymentRepository.create({
        packageId: pkg.id,
        deviceId: device.id,
        tenantId,
        status: dto.scheduledAt ? DeploymentStatus.SCHEDULED : DeploymentStatus.PENDING,
        priority: dto.priority || DeploymentPriority.NORMAL,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        maxRetries: dto.maxRetries ?? 3,
        retryCount: 0,
        overrideSettings: dto.overrideSettings || null,
        metadata: dto.metadata || null,
        deployedBy: userId,
      });

      const savedDeployment = await this.deploymentRepository.save(deployment);
      deployments.push(savedDeployment);

      // Dispatch INSTALL_SOFTWARE remote action
      const remoteActionPayload: any = {
        packageId: pkg.id,
        packageName: pkg.name,
        packageVersion: pkg.version,
        deploymentId: savedDeployment.id,
        fileUrl: pkg.metadata.fileUrl,
        fileHash: pkg.metadata.fileHash,
        installCommand: pkg.metadata.installCommand,
        silentInstall: pkg.metadata.silentInstall ?? true,
        requiresReboot: pkg.metadata.requiresReboot ?? false,
        parameters: { ...pkg.metadata.parameters, ...dto.overrideSettings },
      };

      await this.remoteActionsService.createAutoAction(tenantId, {
        deviceId: device.id,
        actionType: RemoteActionType.INSTALL_SOFTWARE,
        priority: this.mapDeploymentPriorityToActionPriority(deployment.priority),
        payload: remoteActionPayload,
        requiresApproval: false,
        isAuto: true,
      });

      // Emit event
      this.eventsService.emit('software:deployment-created', {
        tenantId,
        deviceId: device.id,
        packageId: pkg.id,
        deploymentId: savedDeployment.id,
      });
    }

    // Update package deployment count
    await this.packageRepository.increment({ id: pkg.id }, 'deploymentCount', deployments.length);

    await this.auditService.logEvent({
      eventType: AuditEventType.SOFTWARE_DEPLOYED,
      tenantId,
      userId,
      details: {
        packageId: pkg.id,
        packageName: pkg.name,
        deviceCount: deployments.length,
        deviceIds,
      },
    });

    return deployments;
  }

  /**
   * Uninstall a package from devices
   */
  async uninstallPackage(
    tenantId: string,
    userId: string,
    dto: UninstallPackageDto,
  ): Promise<void> {
    const pkg = await this.getPackageById(tenantId, dto.packageId);

    const deviceIds = dto.deviceIds || (dto.deviceId ? [dto.deviceId] : []);

    if (deviceIds.length === 0) {
      throw new BadRequestException('Must specify at least one device (deviceId or deviceIds)');
    }

    // Verify devices
    const devices = await this.deviceRepository.find({
      where: {
        id: In(deviceIds),
        tenantId,
      },
    });

    if (devices.length !== deviceIds.length) {
      throw new BadRequestException('One or more devices not found');
    }

    // Dispatch UNINSTALL_SOFTWARE remote actions
    for (const device of devices) {
      const remoteActionPayload: any = {
        packageId: pkg.id,
        packageName: pkg.name,
        packageVersion: pkg.version,
        uninstallCommand: pkg.metadata.uninstallCommand,
        requiresReboot: pkg.metadata.requiresReboot ?? false,
      };

      await this.remoteActionsService.createAutoAction(tenantId, {
        deviceId: device.id,
        actionType: RemoteActionType.UNINSTALL_SOFTWARE,
        priority: dto.priority ? this.mapDeploymentPriorityToActionPriority(dto.priority) : RemoteActionPriority.NORMAL,
        payload: remoteActionPayload,
        requiresApproval: false,
        isAuto: true,
      });
    }

    await this.auditService.logEvent({
      eventType: AuditEventType.SOFTWARE_UNINSTALLED,
      tenantId,
      userId,
      details: {
        packageId: pkg.id,
        packageName: pkg.name,
        deviceCount: deviceIds.length,
        deviceIds,
      },
    });
  }

  /**
   * Get all deployments for a tenant
   */
  async getDeployments(
    tenantId: string,
    filters?: {
      packageId?: string;
      deviceId?: string;
      status?: DeploymentStatus;
    },
  ): Promise<SoftwareDeployment[]> {
    const query = this.deploymentRepository
      .createQueryBuilder('deployment')
      .leftJoinAndSelect('deployment.package', 'package')
      .leftJoinAndSelect('deployment.device', 'device')
      .where('deployment.tenantId = :tenantId', { tenantId });

    if (filters?.packageId) {
      query.andWhere('deployment.packageId = :packageId', { packageId: filters.packageId });
    }

    if (filters?.deviceId) {
      query.andWhere('deployment.deviceId = :deviceId', { deviceId: filters.deviceId });
    }

    if (filters?.status) {
      query.andWhere('deployment.status = :status', { status: filters.status });
    }

    query.orderBy('deployment.createdAt', 'DESC');

    return query.getMany();
  }

  /**
   * Get a single deployment by ID
   */
  async getDeploymentById(tenantId: string, deploymentId: string): Promise<SoftwareDeployment> {
    const deployment = await this.deploymentRepository.findOne({
      where: { id: deploymentId, tenantId },
      relations: ['package', 'device'],
    });

    if (!deployment) {
      throw new NotFoundException('Deployment not found');
    }

    return deployment;
  }

  /**
   * Update deployment status (called by agents or internal processes)
   */
  async updateDeploymentStatus(
    deploymentId: string,
    status: DeploymentStatus,
    updates?: {
      result?: any;
      failureDetails?: any;
      progress?: any;
    },
  ): Promise<SoftwareDeployment> {
    const deployment = await this.deploymentRepository.findOne({
      where: { id: deploymentId },
      relations: ['package'],
    });

    if (!deployment) {
      throw new NotFoundException('Deployment not found');
    }

    deployment.status = status;

    if (status === DeploymentStatus.INSTALLING && !deployment.startedAt) {
      deployment.startedAt = new Date();
    }

    if (status === DeploymentStatus.COMPLETED || status === DeploymentStatus.FAILED) {
      deployment.completedAt = new Date();
    }

    if (updates?.result) {
      deployment.result = updates.result;
    }

    if (updates?.failureDetails) {
      deployment.failureDetails = updates.failureDetails;
    }

    if (updates?.progress) {
      deployment.progress = updates.progress;
    }

    const saved = await this.deploymentRepository.save(deployment);

    // Update package success rate
    if (status === DeploymentStatus.COMPLETED || status === DeploymentStatus.FAILED) {
      await this.updatePackageSuccessRate(deployment.packageId);
    }

    // Emit event
    this.eventsService.emit('software:deployment-updated', {
      tenantId: deployment.tenantId,
      deviceId: deployment.deviceId,
      packageId: deployment.packageId,
      deploymentId: deployment.id,
      status,
    });

    return saved;
  }

  /**
   * Cancel a pending/scheduled deployment
   */
  async cancelDeployment(tenantId: string, userId: string, deploymentId: string): Promise<void> {
    const deployment = await this.getDeploymentById(tenantId, deploymentId);

    if (![DeploymentStatus.PENDING, DeploymentStatus.SCHEDULED].includes(deployment.status)) {
      throw new BadRequestException(
        `Cannot cancel deployment with status "${deployment.status}". Only PENDING or SCHEDULED deployments can be cancelled.`,
      );
    }

    deployment.status = DeploymentStatus.CANCELLED;
    await this.deploymentRepository.save(deployment);

    await this.auditService.logEvent({
      eventType: AuditEventType.SOFTWARE_DEPLOYMENT_CANCELLED,
      tenantId,
      userId,
      details: {
        deploymentId,
        packageId: deployment.packageId,
        deviceId: deployment.deviceId,
      },
    });
  }

  // ==================== Helper Methods ====================

  /**
   * Calculate and update package success rate based on completed deployments
   */
  private async updatePackageSuccessRate(packageId: string): Promise<void> {
    const deployments = await this.deploymentRepository.find({
      where: {
        packageId,
        status: In([DeploymentStatus.COMPLETED, DeploymentStatus.FAILED]),
      },
    });

    if (deployments.length === 0) return;

    const successfulCount = deployments.filter((d) => d.status === DeploymentStatus.COMPLETED).length;
    const successRate = Math.round((successfulCount / deployments.length) * 100);

    await this.packageRepository.update({ id: packageId }, { successRate });
  }

  /**
   * Map deployment priority to remote action priority
   */
  private mapDeploymentPriorityToActionPriority(priority: DeploymentPriority): RemoteActionPriority {
    const mapping: Record<DeploymentPriority, RemoteActionPriority> = {
      [DeploymentPriority.LOW]: RemoteActionPriority.LOW,
      [DeploymentPriority.NORMAL]: RemoteActionPriority.NORMAL,
      [DeploymentPriority.HIGH]: RemoteActionPriority.HIGH,
      [DeploymentPriority.URGENT]: RemoteActionPriority.URGENT,
    };
    return mapping[priority];
  }
}
