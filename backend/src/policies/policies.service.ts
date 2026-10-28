import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DevicePolicy } from '../database/entities/device-policy.entity';
import {
  PolicyAssignment,
  AssignmentScope,
  AssignmentStatus,
} from '../database/entities/policy-assignment.entity';
import { Device } from '../database/entities/device.entity';
import { AuditService } from '../audit/audit.service';
import { AlertsService } from '../alerts/alerts.service';
import { RemoteActionsService } from '../remote-actions/remote-actions.service';
import { AuditEventType } from '@shared/types/audit.types';
import { AlertCategory, AlertSeverity } from '@shared/types/alert.types';
import { RemoteActionType, RemoteActionPriority } from '@shared/types/remote-action.types';
import {
  PolicyType,
  PolicySeverity,
  PolicyStatus,
  PolicyAssignmentScope,
} from '@shared/types/policy.types';

export interface CreatePolicyDto {
  name: string;
  description?: string;
  policyType: PolicyType;
  severity?: PolicySeverity;
  status?: PolicyStatus;
  rules: Record<string, any>;
  metadata?: Record<string, any>;
  version?: string;
  isDefault?: boolean;
}

export interface UpdatePolicyDto {
  name?: string;
  description?: string;
  policyType?: PolicyType;
  severity?: PolicySeverity;
  status?: PolicyStatus;
  rules?: Record<string, any>;
  metadata?: Record<string, any>;
  isDefault?: boolean;
}

export interface AssignPolicyDto {
  policyId: string;
  scope: PolicyAssignmentScope;
  deviceId?: string;
  employeeId?: string;
  priority?: number;
}

@Injectable()
export class PoliciesService {
  constructor(
    @InjectRepository(DevicePolicy)
    private readonly policyRepository: Repository<DevicePolicy>,
    @InjectRepository(PolicyAssignment)
    private readonly assignmentRepository: Repository<PolicyAssignment>,
    private readonly auditService: AuditService,
    private readonly alertsService: AlertsService,
    @Inject(forwardRef(() => RemoteActionsService))
    private readonly remoteActionsService: RemoteActionsService,
  ) {}

  async create(tenantId: string, creatorId: string, dto: CreatePolicyDto): Promise<DevicePolicy> {
    const policy = this.policyRepository.create({
      ...dto,
      tenantId,
      createdBy: creatorId,
      severity: dto.severity || PolicySeverity.MEDIUM,
      status: dto.status || PolicyStatus.ACTIVE,
      isDefault: dto.isDefault ?? false,
      version: dto.version || '1.0.0',
    });

    const savedPolicy = await this.policyRepository.save(policy);

    await this.auditService.logEvent({
      eventType: AuditEventType.SETTINGS_CHANGED,
      tenantId,
      userId: creatorId,
      details: { action: 'POLICY_CREATED', policyId: savedPolicy.id, name: savedPolicy.name },
    });

    return savedPolicy;
  }

  async findAll(tenantId: string, filters?: { policyType?: PolicyType; status?: PolicyStatus }): Promise<DevicePolicy[]> {
    const where: any = { tenantId };
    if (filters?.policyType) where.policyType = filters.policyType;
    if (filters?.status) where.status = filters.status;

    return this.policyRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, tenantId: string): Promise<DevicePolicy> {
    const policy = await this.policyRepository.findOne({
      where: { id, tenantId },
      relations: ['assignments'],
    });

    if (!policy) {
      throw new NotFoundException('Policy not found');
    }

    return policy;
  }

  async update(id: string, tenantId: string, updaterId: string, dto: UpdatePolicyDto): Promise<DevicePolicy> {
    const policy = await this.findOne(id, tenantId);

    Object.assign(policy, dto);
    policy.updatedBy = updaterId;

    const updated = await this.policyRepository.save(policy);

    await this.auditService.logEvent({
      eventType: AuditEventType.SETTINGS_CHANGED,
      tenantId,
      userId: updaterId,
      details: { action: 'POLICY_UPDATED', policyId: id, changes: dto },
    });

    return updated;
  }

  async remove(id: string, tenantId: string, deleterId: string): Promise<void> {
    const policy = await this.findOne(id, tenantId);
    await this.policyRepository.remove(policy);

    await this.auditService.logEvent({
      eventType: AuditEventType.SETTINGS_CHANGED,
      tenantId,
      userId: deleterId,
      details: { action: 'POLICY_DELETED', policyId: id, name: policy.name },
    });
  }

  async assignPolicy(tenantId: string, assignerId: string, dto: AssignPolicyDto): Promise<PolicyAssignment> {
    const policy = await this.findOne(dto.policyId, tenantId);

    const assignment = this.assignmentRepository.create({
      scope: dto.scope as unknown as AssignmentScope,
      policyId: policy.id,
      deviceId: dto.deviceId,
      employeeId: dto.employeeId,
      priority: dto.priority || 1,
      tenantId,
      assignedBy: assignerId,
      assignedAt: new Date(),
      status: AssignmentStatus.ACTIVE,
    } as any);

    const saved = await this.assignmentRepository.save(assignment);

    await this.auditService.logEvent({
      eventType: AuditEventType.POLICY_ASSIGNED,
      tenantId,
      userId: assignerId,
      deviceId: dto.deviceId,
      details: { policyId: policy.id, policyName: policy.name, scope: dto.scope },
    });

    return saved as unknown as PolicyAssignment;
  }

  async getPoliciesForDevice(deviceId: string, tenantId: string): Promise<DevicePolicy[]> {
    // Return all default policies plus specifically assigned policies for this device
    const directAssignments = await this.assignmentRepository.find({
      where: [
        { deviceId, tenantId, status: AssignmentStatus.ACTIVE },
        { scope: AssignmentScope.ALL_DEVICES, tenantId, status: AssignmentStatus.ACTIVE },
      ],
      relations: ['policy'],
    });

    const defaultPolicies = await this.policyRepository.find({
      where: { tenantId, isDefault: true, status: PolicyStatus.ACTIVE },
    });

    const policyMap = new Map<string, DevicePolicy>();

    for (const p of defaultPolicies) {
      policyMap.set(p.id, p);
    }

    for (const a of directAssignments) {
      if (a.policy && a.policy.status === PolicyStatus.ACTIVE) {
        policyMap.set(a.policy.id, a.policy);
      }
    }

    return Array.from(policyMap.values());
  }

  /**
   * Comprehensive policy evaluation and enforcement engine
   * Evaluates all active policies for a device against telemetry data
   * Triggers enforcement actions for violations
   */
  async evaluateAndEnforce(
    device: Device,
    telemetryData: Record<string, any>,
  ): Promise<{ violations: any[]; enforced: number }> {
    const violations: any[] = [];
    let enforced = 0;

    try {
      // Fetch active policies for device
      const policies = await this.getPoliciesForDevice(device.id, device.tenantId);

      for (const policy of policies) {
        // Skip GEOCURFEW (handled separately in geocurfew.service.ts)
        if (policy.policyType === PolicyType.GEOCURFEW) {
          continue;
        }

        // Evaluate each rule in the policy
        const violation = await this.evaluateRule(policy, telemetryData);

        if (violation.violated) {
          violations.push({
            policyId: policy.id,
            policyName: policy.name,
            policyType: policy.policyType,
            severity: policy.severity,
            rule: violation.rule,
            actualValue: violation.actualValue,
            expectedValue: violation.expectedValue,
            message: violation.message,
          });

          // Trigger enforcement actions
          try {
            await this.enforcePolicy(device, policy, violation);
            enforced++;
          } catch (err) {
            console.error(`Enforcement failed for policy ${policy.name}:`, err);
          }
        }
      }
    } catch (error) {
      console.error('Policy evaluation failed:', error);
    }

    return { violations, enforced };
  }

  /**
   * Evaluate a single policy rule against telemetry data
   */
  private async evaluateRule(
    policy: DevicePolicy,
    telemetryData: Record<string, any>,
  ): Promise<{
    violated: boolean;
    rule?: string;
    actualValue?: any;
    expectedValue?: any;
    message?: string;
  }> {
    const rules = policy.rules;

    switch (policy.policyType) {
      case PolicyType.SECURITY:
        return this.evaluateSecurityPolicy(rules, telemetryData);

      case PolicyType.COMPLIANCE:
        return this.evaluateCompliancePolicy(rules, telemetryData);

      case PolicyType.DEVICE:
        return this.evaluateDevicePolicy(rules, telemetryData);

      case PolicyType.SOFTWARE:
        return this.evaluateSoftwarePolicy(rules, telemetryData);

      case PolicyType.NETWORK:
        return this.evaluateNetworkPolicy(rules, telemetryData);

      default:
        return { violated: false };
    }
  }

  /**
   * Evaluate SECURITY policy rules
   */
  private evaluateSecurityPolicy(
    rules: Record<string, any>,
    telemetryData: Record<string, any>,
  ): {
    violated: boolean;
    rule?: string;
    actualValue?: any;
    expectedValue?: any;
    message?: string;
  } {
    // DISK_ENCRYPTION: BitLocker/FileVault required
    if (rules.diskEncryption?.required === true) {
      const disks = telemetryData.disks || [];
      const unencryptedDisk = disks.find((d: any) => d.bitlocker === false);

      if (unencryptedDisk) {
        return {
          violated: true,
          rule: 'DISK_ENCRYPTION',
          actualValue: false,
          expectedValue: true,
          message: `Disk ${unencryptedDisk.mount} is not encrypted`,
        };
      }
    }

    // PROCESS_BLACKLIST: Prohibited processes
    if (rules.processBlacklist && Array.isArray(rules.processBlacklist)) {
      const liveProcesses = telemetryData.liveProcesses || [];
      const blacklist = rules.processBlacklist.map((p: string) => p.toLowerCase());

      for (const proc of liveProcesses) {
        const procName = (proc.name || '').toLowerCase();
        if (blacklist.some((b: string) => procName.includes(b))) {
          return {
            violated: true,
            rule: 'PROCESS_BLACKLIST',
            actualValue: proc.name,
            expectedValue: 'Process not in blacklist',
            message: `Prohibited process detected: ${proc.name}`,
          };
        }
      }
    }

    // SCREEN_LOCK_TIMEOUT: Maximum idle time before lock
    if (rules.screenLockTimeout && typeof rules.screenLockTimeout.maxSeconds === 'number') {
      const currentTimeout = telemetryData.screenLockTimeout;
      if (currentTimeout && currentTimeout > rules.screenLockTimeout.maxSeconds) {
        return {
          violated: true,
          rule: 'SCREEN_LOCK_TIMEOUT',
          actualValue: currentTimeout,
          expectedValue: rules.screenLockTimeout.maxSeconds,
          message: `Screen lock timeout exceeds policy (${currentTimeout}s > ${rules.screenLockTimeout.maxSeconds}s)`,
        };
      }
    }

    return { violated: false };
  }

  /**
   * Evaluate COMPLIANCE policy rules
   */
  private evaluateCompliancePolicy(
    rules: Record<string, any>,
    telemetryData: Record<string, any>,
  ): {
    violated: boolean;
    rule?: string;
    actualValue?: any;
    expectedValue?: any;
    message?: string;
  } {
    // OS_VERSION: Minimum OS version required
    if (rules.osVersion?.minimum) {
      const currentVersion = telemetryData.osVersion || '';
      const requiredVersion = rules.osVersion.minimum;

      // Simple version comparison (works for major versions)
      if (currentVersion && this.compareVersions(currentVersion, requiredVersion) < 0) {
        return {
          violated: true,
          rule: 'OS_VERSION',
          actualValue: currentVersion,
          expectedValue: `>= ${requiredVersion}`,
          message: `OS version ${currentVersion} is below minimum ${requiredVersion}`,
        };
      }
    }

    // BATTERY_LEVEL: Minimum battery required (Android/Mobile)
    if (rules.batteryLevel?.minimum && typeof telemetryData.batteryLevel === 'number') {
      if (telemetryData.batteryLevel < rules.batteryLevel.minimum) {
        return {
          violated: true,
          rule: 'BATTERY_LEVEL',
          actualValue: telemetryData.batteryLevel,
          expectedValue: `>= ${rules.batteryLevel.minimum}%`,
          message: `Battery level ${telemetryData.batteryLevel}% is below minimum ${rules.batteryLevel.minimum}%`,
        };
      }
    }

    // TIME_RESTRICTION: Working hours enforcement
    if (rules.timeRestriction?.enabled === true) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentDay = now.getDay();

      const { startHour, endHour, daysOfWeek } = rules.timeRestriction;

      // Check day of week
      if (daysOfWeek && !daysOfWeek.includes(currentDay)) {
        return {
          violated: true,
          rule: 'TIME_RESTRICTION',
          actualValue: `Day ${currentDay}, Hour ${currentHour}`,
          expectedValue: `Days ${daysOfWeek.join(',')}, Hours ${startHour}-${endHour}`,
          message: `Device used outside authorized days`,
        };
      }

      // Check hour range
      const withinHours =
        endHour < startHour
          ? currentHour >= startHour || currentHour < endHour
          : currentHour >= startHour && currentHour < endHour;

      if (!withinHours) {
        return {
          violated: true,
          rule: 'TIME_RESTRICTION',
          actualValue: `Hour ${currentHour}`,
          expectedValue: `Hours ${startHour}-${endHour}`,
          message: `Device used outside authorized hours`,
        };
      }
    }

    return { violated: false };
  }

  /**
   * Evaluate DEVICE policy rules
   */
  private evaluateDevicePolicy(
    rules: Record<string, any>,
    telemetryData: Record<string, any>,
  ): {
    violated: boolean;
    rule?: string;
    actualValue?: any;
    expectedValue?: any;
    message?: string;
  } {
    // STORAGE_THRESHOLD: Minimum free storage required
    if (rules.storageThreshold?.minimumFreeGB) {
      const disks = telemetryData.disks || [];
      for (const disk of disks) {
        const freeGB = disk.freeSpaceGB || 0;
        if (freeGB < rules.storageThreshold.minimumFreeGB) {
          return {
            violated: true,
            rule: 'STORAGE_THRESHOLD',
            actualValue: `${freeGB}GB`,
            expectedValue: `>= ${rules.storageThreshold.minimumFreeGB}GB`,
            message: `Disk ${disk.mount} has insufficient free space (${freeGB}GB)`,
          };
        }
      }
    }

    // THERMAL_THRESHOLD: Maximum CPU temperature
    if (rules.thermalThreshold?.maxCpuTemp) {
      const cpuTemp = telemetryData.thermals?.cpuTemp;
      if (cpuTemp && cpuTemp > rules.thermalThreshold.maxCpuTemp) {
        return {
          violated: true,
          rule: 'THERMAL_THRESHOLD',
          actualValue: `${cpuTemp}°C`,
          expectedValue: `<= ${rules.thermalThreshold.maxCpuTemp}°C`,
          message: `CPU temperature ${cpuTemp}°C exceeds threshold`,
        };
      }
    }

    return { violated: false };
  }

  /**
   * Evaluate SOFTWARE policy rules
   */
  private evaluateSoftwarePolicy(
    rules: Record<string, any>,
    telemetryData: Record<string, any>,
  ): {
    violated: boolean;
    rule?: string;
    actualValue?: any;
    expectedValue?: any;
    message?: string;
  } {
    // REQUIRED_SOFTWARE: Software that must be installed
    if (rules.requiredSoftware && Array.isArray(rules.requiredSoftware)) {
      const installedSoftware = telemetryData.installedSoftware || [];
      const installedNames = installedSoftware.map((s: any) => (s.name || '').toLowerCase());

      for (const required of rules.requiredSoftware) {
        const reqName = required.toLowerCase();
        if (!installedNames.some((name: string) => name.includes(reqName))) {
          return {
            violated: true,
            rule: 'REQUIRED_SOFTWARE',
            actualValue: 'Not installed',
            expectedValue: required,
            message: `Required software not found: ${required}`,
          };
        }
      }
    }

    // PROHIBITED_SOFTWARE: Software that must NOT be installed
    if (rules.prohibitedSoftware && Array.isArray(rules.prohibitedSoftware)) {
      const installedSoftware = telemetryData.installedSoftware || [];
      const prohibited = rules.prohibitedSoftware.map((p: string) => p.toLowerCase());

      for (const software of installedSoftware) {
        const softwareName = (software.name || '').toLowerCase();
        if (prohibited.some((p: string) => softwareName.includes(p))) {
          return {
            violated: true,
            rule: 'PROHIBITED_SOFTWARE',
            actualValue: software.name,
            expectedValue: 'Not installed',
            message: `Prohibited software detected: ${software.name}`,
          };
        }
      }
    }

    return { violated: false };
  }

  /**
   * Evaluate NETWORK policy rules
   */
  private evaluateNetworkPolicy(
    rules: Record<string, any>,
    telemetryData: Record<string, any>,
  ): {
    violated: boolean;
    rule?: string;
    actualValue?: any;
    expectedValue?: any;
    message?: string;
  } {
    // ALLOWED_NETWORKS: SSID whitelist
    if (rules.allowedNetworks && Array.isArray(rules.allowedNetworks)) {
      const currentSsid = telemetryData.networkInfo?.ssid;
      if (currentSsid && !rules.allowedNetworks.includes(currentSsid)) {
        return {
          violated: true,
          rule: 'ALLOWED_NETWORKS',
          actualValue: currentSsid,
          expectedValue: rules.allowedNetworks.join(', '),
          message: `Connected to unauthorized network: ${currentSsid}`,
        };
      }
    }

    // VPN_REQUIRED: VPN connection mandatory
    if (rules.vpnRequired === true) {
      const vpnActive = telemetryData.networkInfo?.vpnActive;
      if (vpnActive === false) {
        return {
          violated: true,
          rule: 'VPN_REQUIRED',
          actualValue: false,
          expectedValue: true,
          message: 'VPN connection required but not active',
        };
      }
    }

    return { violated: false };
  }

  /**
   * Trigger enforcement actions for policy violation
   */
  private async enforcePolicy(
    device: Device,
    policy: DevicePolicy,
    violation: any,
  ): Promise<void> {
    const enforcementConfig = policy.rules.enforcement || {};

    // 1. Create alert (always)
    await this.alertsService.create(device.tenantId, {
      title: `Policy Violation: ${policy.name}`,
      description: `Device ${device.deviceName} violated policy "${policy.name}". Rule: ${violation.rule}. ${violation.message}`,
      severity: this.mapPolicySeverityToAlertSeverity(policy.severity),
      category: AlertCategory.COMPLIANCE,
      deviceId: device.id,
      details: {
        policyId: policy.id,
        policyName: policy.name,
        policyType: policy.policyType,
        rule: violation.rule,
        actualValue: violation.actualValue,
        expectedValue: violation.expectedValue,
      },
    });

    // 2. Trigger automated enforcement actions based on rule type
    if (violation.rule === 'PROCESS_BLACKLIST' && enforcementConfig.autoKillProcess !== false) {
      await this.remoteActionsService.createAutoAction({
        deviceId: device.id,
        tenantId: device.tenantId,
        actionType: RemoteActionType.KILL_PROCESS,
        priority: RemoteActionPriority.URGENT,
        payload: {
          processName: violation.actualValue,
          reason: 'POLICY_VIOLATION',
        },
        reason: `Auto-remediation: Kill blacklisted process ${violation.actualValue}`,
      });
    }

    if (violation.rule === 'TIME_RESTRICTION' && enforcementConfig.autoLock !== false) {
      await this.remoteActionsService.createAutoAction({
        deviceId: device.id,
        tenantId: device.tenantId,
        actionType: RemoteActionType.LOCK_DEVICE,
        priority: RemoteActionPriority.URGENT,
        payload: {
          reason: 'POLICY_VIOLATION',
          message: violation.message,
        },
        reason: `Auto-lock for time restriction violation`,
      });
    }

    // 3. Send notification to user (if enabled)
    if (enforcementConfig.notifyUser !== false) {
      await this.remoteActionsService.createAutoAction({
        deviceId: device.id,
        tenantId: device.tenantId,
        actionType: RemoteActionType.SEND_NOTIFICATION,
        priority: RemoteActionPriority.NORMAL,
        payload: {
          title: 'Policy Violation',
          message: violation.message,
          category: 'COMPLIANCE',
        },
        reason: `Policy violation notification: ${policy.name}`,
      });
    }

    // 4. Log audit event
    await this.auditService.logEvent({
      eventType: AuditEventType.POLICY_VIOLATION,
      tenantId: device.tenantId,
      deviceId: device.id,
      details: {
        policyId: policy.id,
        policyName: policy.name,
        policyType: policy.policyType,
        rule: violation.rule,
        actualValue: violation.actualValue,
        expectedValue: violation.expectedValue,
        message: violation.message,
        enforcementActions: {
          alertCreated: true,
          autoRemediationTriggered: violation.rule === 'PROCESS_BLACKLIST',
          userNotified: enforcementConfig.notifyUser !== false,
        },
      },
    });
  }

  /**
   * Map policy severity to alert severity
   */
  private mapPolicySeverityToAlertSeverity(policySeverity: PolicySeverity): AlertSeverity {
    switch (policySeverity) {
      case PolicySeverity.LOW:
        return AlertSeverity.INFO;
      case PolicySeverity.MEDIUM:
        return AlertSeverity.WARNING;
      case PolicySeverity.HIGH:
        return AlertSeverity.ERROR;
      case PolicySeverity.CRITICAL:
        return AlertSeverity.CRITICAL;
      default:
        return AlertSeverity.WARNING;
    }
  }

  /**
   * Simple version comparison (major.minor.patch)
   * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map((p) => parseInt(p) || 0);
    const parts2 = v2.split('.').map((p) => parseInt(p) || 0);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }

    return 0;
  }
}
