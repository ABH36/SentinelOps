import { Injectable, UnauthorizedException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceHeartbeat } from '../database/entities/device-heartbeat.entity';
import { Device } from '../database/entities/device.entity';
import { DeviceHealth, DeviceConnectivity, DeviceAgentStatus } from '@shared/types/device.types';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '@shared/types/audit.types';
import { DeviceStatus } from '@shared/types/device.types';
import { EventsService } from '../events/events.service';
import { AlertsService } from '../alerts/alerts.service';
import { AlertCategory, AlertSeverity } from '@shared/types/alert.types';
import { RemoteActionsService } from '../remote-actions/remote-actions.service';
import { RemoteActionType, RemoteActionPriority } from '@shared/types/remote-action.types';
import { GeocurfewService } from './geocurfew.service';
import { PoliciesService } from '../policies/policies.service';

export interface SubmitHeartbeatDto {
  deviceKey: string;
  deviceSecret: string;
  health: DeviceHealth;
  connectivity?: DeviceConnectivity;
  agent?: DeviceAgentStatus;
  metadata?: Record<string, any>;
}

@Injectable()
export class HeartbeatService {
  constructor(
    @InjectRepository(DeviceHeartbeat)
    private readonly heartbeatRepository: Repository<DeviceHeartbeat>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly enrollmentService: EnrollmentService,
    private readonly auditService: AuditService,
    private readonly eventsService: EventsService,
    private readonly alertsService: AlertsService,
    @Inject(forwardRef(() => RemoteActionsService))
    private readonly remoteActionsService: RemoteActionsService,
    private readonly geocurfewService: GeocurfewService,
    private readonly policiesService: PoliciesService,
  ) {}

  async submitHeartbeat(submitHeartbeatDto: SubmitHeartbeatDto, ipAddress?: string): Promise<DeviceHeartbeat> {
    // Verify device credentials
    const device = await this.enrollmentService.verifyCredential(
      submitHeartbeatDto.deviceKey,
      submitHeartbeatDto.deviceSecret,
    );

    // Create heartbeat record
    const heartbeat = this.heartbeatRepository.create({
      health: submitHeartbeatDto.health,
      connectivity: submitHeartbeatDto.connectivity,
      agent: submitHeartbeatDto.agent,
      metadata: submitHeartbeatDto.metadata,
      deviceId: device.id,
    });

    const savedHeartbeat = await this.heartbeatRepository.save(heartbeat);

    const updatedMetadata = submitHeartbeatDto.metadata
      ? { ...(device.metadata || {}), ...submitHeartbeatDto.metadata }
      : device.metadata;

    // Update device last seen, status, and metadata
    await this.deviceRepository.update(
      { id: device.id },
      {
        lastSeenAt: new Date(),
        ipAddress: ipAddress || device.ipAddress,
        status: DeviceStatus.ACTIVE,
        metadata: updatedMetadata,
      },
    );

    // Emit live real-time event for SSE
    this.eventsService.emit('device:heartbeat', {
      tenantId: device.tenantId,
      deviceId: device.id,
      health: submitHeartbeatDto.health,
      connectivity: submitHeartbeatDto.connectivity,
      agent: submitHeartbeatDto.agent,
      metadata: updatedMetadata,
      status: DeviceStatus.ACTIVE,
      lastSeenAt: new Date(),
    });

    // Automated Enterprise Telemetry Checks & Alert Triggering
    try {
      await this.evaluateEnterpriseTelemetry(device, updatedMetadata, submitHeartbeatDto.health);
    } catch (err) {
      // Non-blocking
    }

    // Evaluate Geocurfew Policy (location-based access control)
    if (updatedMetadata?.location) {
      try {
        const geocurfewResult = await this.geocurfewService.evaluateGeocurfew(device, updatedMetadata.location);
        
        // Update metadata with geocurfew evaluation result
        if (geocurfewResult.violation) {
          updatedMetadata.geofenceViolation = true;
          updatedMetadata.geofenceViolationReason = geocurfewResult.reason;
          
          // Update device metadata
          await this.deviceRepository.update(
            { id: device.id },
            { metadata: updatedMetadata },
          );
        }
      } catch (err) {
        console.error('Geocurfew evaluation failed:', err);
        // Non-blocking
      }
    }

    // Comprehensive Policy Enforcement Engine
    try {
      const policyResult = await this.policiesService.evaluateAndEnforce(device, updatedMetadata);
      
      // Store policy evaluation results in metadata
      if (policyResult.violations.length > 0) {
        updatedMetadata.policyViolations = policyResult.violations;
        updatedMetadata.lastPolicyEvaluation = new Date().toISOString();
        
        // Update device metadata
        await this.deviceRepository.update(
          { id: device.id },
          { metadata: updatedMetadata },
        );
      }
    } catch (err) {
      console.error('Policy enforcement failed:', err);
      // Non-blocking
    }

    return savedHeartbeat;
  }

  private async evaluateEnterpriseTelemetry(
    device: Device,
    metadata?: Record<string, any>,
    health?: DeviceHealth,
  ): Promise<void> {
    if (!metadata) return;

    // 1. Prohibited / Blacklisted Process Watchdog
    const blacklistedNames = ['torrent', 'utorrent', 'bittorrent', 'wireshark', 'anydesk', 'minergate', 'cheatengine'];
    const liveProcesses = metadata.liveProcesses || [];
    for (const proc of liveProcesses) {
      const pName = (proc.name || '').toLowerCase();
      if (blacklistedNames.some((b) => pName.includes(b))) {
        // Create CRITICAL alert
        await this.alertsService.create(device.tenantId, {
          title: `Prohibited Software Detected: ${proc.name}`,
          description: `Process ${proc.name} (PID: ${proc.pid}) was detected running on device ${device.deviceName}. Unauthorized tools violate enterprise security compliance.`,
          severity: AlertSeverity.CRITICAL,
          category: AlertCategory.SECURITY,
          deviceId: device.id,
          details: { process: proc },
          remediation: { action: 'KILL_PROCESS', recommended: true },
        });

        // AUTO-REMEDIATION: Immediately kill blacklisted process
        try {
          await this.remoteActionsService.createAutoAction({
            deviceId: device.id,
            tenantId: device.tenantId,
            actionType: RemoteActionType.KILL_PROCESS,
            priority: RemoteActionPriority.URGENT,
            payload: {
              processName: proc.name,
              pid: proc.pid,
              reason: 'AUTO_REMEDIATION',
            },
            reason: `Automated kill of blacklisted process: ${proc.name}`,
          });

          // Send notification to user about security violation
          await this.remoteActionsService.createAutoAction({
            deviceId: device.id,
            tenantId: device.tenantId,
            actionType: RemoteActionType.SEND_NOTIFICATION,
            priority: RemoteActionPriority.URGENT,
            payload: {
              title: 'Security Violation Detected',
              message: `${proc.name} has been terminated due to enterprise security policy. Contact IT if you believe this is an error.`,
              category: 'SECURITY',
            },
            reason: `Security notification for blacklisted process: ${proc.name}`,
          });
        } catch (err) {
          // Log auto-remediation failure but don't block heartbeat processing
          console.error(`Auto-remediation failed for ${proc.name}:`, err);
        }
      }
    }

    // 2. Hardware Thermal Overheat Watchdog
    const cpuTemp = metadata.thermals?.cpuTemp;
    if (typeof cpuTemp === 'number' && cpuTemp >= 85) {
      await this.alertsService.create(device.tenantId, {
        title: `Hardware Thermal Alert: CPU Exceeds ${cpuTemp}°C`,
        description: `Device ${device.deviceName} CPU core temperature has reached critical threshold (${cpuTemp}°C). Prolonged heat risks hardware damage or thermal throttling.`,
        severity: AlertSeverity.WARNING,
        category: AlertCategory.PERFORMANCE,
        deviceId: device.id,
        details: { thermals: metadata.thermals },
      });
    }

    // 3. Geofencing Boundary Evaluation
    if (metadata.location?.geofenceViolation === true) {
      await this.alertsService.create(device.tenantId, {
        title: `Geofence Perimeter Breach`,
        description: `Device ${device.deviceName} reported coordinates outside authorized operating perimeter (${metadata.location.latitude}, ${metadata.location.longitude} - ${metadata.location.address || 'Unknown zone'}).`,
        severity: AlertSeverity.CRITICAL,
        category: AlertCategory.COMPLIANCE,
        deviceId: device.id,
        details: { location: metadata.location },
      });
    }

    // 4. Unencrypted Storage Alert
    if (Array.isArray(metadata.disks)) {
      const unencrypted = metadata.disks.find((d: any) => d.bitlocker === false);
      if (unencrypted) {
        await this.alertsService.create(device.tenantId, {
          title: `Unencrypted Storage Volume: ${unencrypted.mount}`,
          description: `Drive ${unencrypted.mount} (${unencrypted.type}) does not have BitLocker/Enterprise encryption enabled. At-rest data is vulnerable to exfiltration.`,
          severity: AlertSeverity.ERROR,
          category: AlertCategory.SECURITY,
          deviceId: device.id,
          details: { drive: unencrypted },
        });
      }
    }
  }

  async getLatestHeartbeat(deviceId: string, tenantId: string): Promise<DeviceHeartbeat> {
    const heartbeat = await this.heartbeatRepository.findOne({
      where: { deviceId },
      order: { createdAt: 'DESC' },
    });

    if (!heartbeat) {
      throw new Error('No heartbeat found for device');
    }

    return heartbeat;
  }

  async getHeartbeatHistory(
    deviceId: string,
    tenantId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<{ heartbeats: DeviceHeartbeat[]; total: number }> {
    const [heartbeats, total] = await this.heartbeatRepository.findAndCount({
      where: { deviceId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { heartbeats, total };
  }

  async markDeviceOffline(deviceId: string, tenantId: string): Promise<void> {
    await this.deviceRepository.update(
      { id: deviceId, tenantId },
      { status: DeviceStatus.OFFLINE },
    );
  }

  /**
   * Handle tamper event reported by agent or watchdog.
   * Creates CRITICAL security alert and logs audit event.
   */
  async handleTamperEvent(
    deviceKey: string,
    deviceSecret: string,
    tamperEvent: {
      reason: string;
      details: string;
      timestamp: string;
      processName?: string;
      executablePath?: string;
      consecutiveRestarts?: number;
      hostname?: string;
      username?: string;
      processId?: number;
      parentProcess?: string;
    },
  ): Promise<{ success: boolean; alertId?: string }> {
    try {
      // Verify device credentials
      const device = await this.enrollmentService.verifyCredential(deviceKey, deviceSecret);

      if (!device) {
        throw new UnauthorizedException('Invalid device credentials');
      }

      // Map tamper reason to alert title
      const alertTitleMap: Record<string, string> = {
        AGENT_KILLED: 'Tamper Detected: Agent Process Terminated',
        AGENT_RESTART_FAILED: 'Tamper Detected: Agent Restart Failed',
        REPEATED_RESTART_FAILURE: 'Critical Tamper: Repeated Agent Restart Failures',
        DEBUGGER_DETECTED: 'Tamper Detected: Debugger Attached to Agent',
      };

      const alertTitle = alertTitleMap[tamperEvent.reason] || `Tamper Detected: ${tamperEvent.reason}`;

      // Build detailed alert description
      let alertDescription = `Security violation detected on device ${device.deviceName}.\n\n`;
      alertDescription += `**Reason:** ${tamperEvent.reason}\n`;
      alertDescription += `**Details:** ${tamperEvent.details}\n`;
      alertDescription += `**Timestamp:** ${tamperEvent.timestamp}\n`;

      if (tamperEvent.hostname) {
        alertDescription += `**Hostname:** ${tamperEvent.hostname}\n`;
      }

      if (tamperEvent.processName) {
        alertDescription += `**Process:** ${tamperEvent.processName}\n`;
      }

      if (tamperEvent.consecutiveRestarts && tamperEvent.consecutiveRestarts > 1) {
        alertDescription += `**Consecutive Restarts:** ${tamperEvent.consecutiveRestarts} (Indicates persistent issue)\n`;
      }

      if (tamperEvent.parentProcess) {
        alertDescription += `**Parent Process:** ${tamperEvent.parentProcess}\n`;
      }

      // Determine alert severity
      let severity = AlertSeverity.CRITICAL;
      if (tamperEvent.reason === 'REPEATED_RESTART_FAILURE') {
        // Even more critical - possible system compromise
        alertDescription += `\n⚠️ **CRITICAL:** Multiple consecutive restart failures may indicate system compromise or persistent attack.`;
      }

      // Create CRITICAL security alert
      const alert = await this.alertsService.create(device.tenantId, {
        title: alertTitle,
        description: alertDescription,
        severity: severity,
        category: AlertCategory.SECURITY,
        deviceId: device.id,
        details: {
          tamperReason: tamperEvent.reason,
          tamperDetails: tamperEvent.details,
          timestamp: tamperEvent.timestamp,
          processName: tamperEvent.processName,
          executablePath: tamperEvent.executablePath,
          consecutiveRestarts: tamperEvent.consecutiveRestarts,
          hostname: tamperEvent.hostname,
          username: tamperEvent.username,
          processId: tamperEvent.processId,
          parentProcess: tamperEvent.parentProcess,
        },
      });

      // Log audit event
      await this.auditService.logEvent({
        eventType: AuditEventType.TAMPER_DETECTED,
        tenantId: device.tenantId,
        deviceId: device.id,
        details: {
          reason: tamperEvent.reason,
          details: tamperEvent.details,
          alertId: alert.id,
          consecutiveRestarts: tamperEvent.consecutiveRestarts,
          hostname: tamperEvent.hostname,
          parentProcess: tamperEvent.parentProcess,
        },
      });

      // Emit real-time SSE event to admin dashboard
      this.eventsService.emit('tamper:detected', {
        tenantId: device.tenantId,
        deviceId: device.id,
        deviceName: device.deviceName,
        reason: tamperEvent.reason,
        details: tamperEvent.details,
        timestamp: tamperEvent.timestamp,
        alertId: alert.id,
        severity: severity,
      });

      return { success: true, alertId: alert.id };
    } catch (error) {
      // Log error but don't expose sensitive information
      console.error('Error handling tamper event:', error);
      throw error;
    }
  }
}
