import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Device } from '../database/entities/device.entity';
import { PoliciesService } from '../policies/policies.service';
import { RemoteActionsService } from '../remote-actions/remote-actions.service';
import { AlertsService } from '../alerts/alerts.service';
import { AuditService } from '../audit/audit.service';
import { PolicyType } from '@shared/types/policy.types';
import { RemoteActionType, RemoteActionPriority } from '@shared/types/remote-action.types';
import { AlertCategory, AlertSeverity } from '@shared/types/alert.types';
import { AuditEventType } from '@shared/types/audit.types';

interface GeoPoint {
  latitude: number;
  longitude: number;
}

interface GeoPolygon {
  coordinates: GeoPoint[];
}

interface GeocurfewPolicy {
  enabled: boolean;
  geofence?: GeoPolygon;
  operatingHours?: {
    enabled: boolean;
    startHour: number; // 0-23
    endHour: number; // 0-23
    daysOfWeek?: number[]; // 0=Sunday, 6=Saturday
  };
  enforcementActions?: {
    lockDevice?: boolean;
    sendNotification?: boolean;
    createAlert?: boolean;
  };
}

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: string;
  address?: string;
}

@Injectable()
export class GeocurfewService {
  constructor(
    private readonly policiesService: PoliciesService,
    @Inject(forwardRef(() => RemoteActionsService))
    private readonly remoteActionsService: RemoteActionsService,
    private readonly alertsService: AlertsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Check if a point is inside a polygon using ray-casting algorithm
   * @param point The GPS coordinates to check
   * @param polygon The geofence boundary polygon
   * @returns true if point is inside polygon, false otherwise
   */
  isPointInPolygon(point: GeoPoint, polygon: GeoPolygon): boolean {
    const { latitude: lat, longitude: lng } = point;
    const vertices = polygon.coordinates;

    if (!vertices || vertices.length < 3) {
      return false; // Not a valid polygon
    }

    let inside = false;

    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].longitude;
      const yi = vertices[i].latitude;
      const xj = vertices[j].longitude;
      const yj = vertices[j].latitude;

      const intersect =
        yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Check if current time is within operating hours
   * @param operatingHours The time restrictions from policy
   * @returns true if within operating hours, false otherwise
   */
  isWithinOperatingHours(
    operatingHours: GeocurfewPolicy['operatingHours'],
  ): boolean {
    if (!operatingHours || !operatingHours.enabled) {
      return true; // No time restrictions
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0=Sunday, 6=Saturday

    // Check day of week if specified
    if (operatingHours.daysOfWeek && operatingHours.daysOfWeek.length > 0) {
      if (!operatingHours.daysOfWeek.includes(currentDay)) {
        return false; // Today is not an allowed day
      }
    }

    // Check hour range
    const { startHour, endHour } = operatingHours;

    // Handle cases where end hour is before start hour (crosses midnight)
    if (endHour < startHour) {
      // Example: 22:00 to 06:00
      return currentHour >= startHour || currentHour < endHour;
    } else {
      // Example: 09:00 to 17:00
      return currentHour >= startHour && currentHour < endHour;
    }
  }

  /**
   * Evaluate geocurfew policy for a device based on its current location
   * @param device The device to evaluate
   * @param location Current GPS location from heartbeat
   */
  async evaluateGeocurfew(
    device: Device,
    location: LocationData,
  ): Promise<{ violation: boolean; reason?: string }> {
    try {
      // Fetch active GEOCURFEW policies for device
      const policies = await this.policiesService.getPoliciesForDevice(device.id, device.tenantId);
      const geocurfewPolicies = policies.filter((p) => p.policyType === PolicyType.GEOCURFEW);

      if (geocurfewPolicies.length === 0) {
        return { violation: false }; // No geocurfew policy active
      }

      // Evaluate each policy (use most restrictive)
      for (const policy of geocurfewPolicies) {
        const rules = policy.rules as GeocurfewPolicy;

        if (!rules.enabled) {
          continue; // Policy is disabled
        }

        let geofenceViolation = false;
        let timeViolation = false;

        // Check geofence boundary
        if (rules.geofence && rules.geofence.coordinates) {
          const point: GeoPoint = {
            latitude: location.latitude,
            longitude: location.longitude,
          };

          const isInside = this.isPointInPolygon(point, rules.geofence);

          if (!isInside) {
            geofenceViolation = true;
          }
        }

        // Check operating hours
        if (rules.operatingHours) {
          const isWithinHours = this.isWithinOperatingHours(rules.operatingHours);

          if (!isWithinHours) {
            timeViolation = true;
          }
        }

        // Violation if BOTH conditions are violated (stricter enforcement)
        // Or if only one condition exists and it's violated
        const hasGeofence = rules.geofence && rules.geofence.coordinates;
        const hasOperatingHours = rules.operatingHours && rules.operatingHours.enabled;

        let violation = false;
        let reason = '';

        if (hasGeofence && hasOperatingHours) {
          // Both conditions must be violated
          if (geofenceViolation && timeViolation) {
            violation = true;
            reason = 'Device is outside authorized geofence AND outside operating hours';
          }
        } else if (hasGeofence) {
          // Only geofence check
          if (geofenceViolation) {
            violation = true;
            reason = 'Device is outside authorized geofence boundary';
          }
        } else if (hasOperatingHours) {
          // Only time check
          if (timeViolation) {
            violation = true;
            reason = 'Device is being used outside authorized operating hours';
          }
        }

        if (violation) {
          // Trigger enforcement actions
          await this.enforceGeocurfewViolation(device, policy.name, reason, location, rules);

          return { violation: true, reason };
        }
      }

      return { violation: false };
    } catch (error) {
      console.error('Error evaluating geocurfew:', error);
      return { violation: false }; // Don't block heartbeat on evaluation error
    }
  }

  /**
   * Execute enforcement actions for geocurfew violation
   */
  private async enforceGeocurfewViolation(
    device: Device,
    policyName: string,
    reason: string,
    location: LocationData,
    rules: GeocurfewPolicy,
  ): Promise<void> {
    const enforcementActions = rules.enforcementActions || {
      lockDevice: true,
      sendNotification: true,
      createAlert: true,
    };

    // 1. Create CRITICAL compliance alert
    if (enforcementActions.createAlert !== false) {
      await this.alertsService.create(device.tenantId, {
        title: `Geocurfew Violation: ${device.deviceName}`,
        description: `Device ${device.deviceName} violated geocurfew policy "${policyName}". ${reason}.\n\nLocation: ${location.latitude}, ${location.longitude}${location.address ? ` (${location.address})` : ''}`,
        severity: AlertSeverity.CRITICAL,
        category: AlertCategory.COMPLIANCE,
        deviceId: device.id,
        details: {
          policyName,
          reason,
          location,
          timestamp: location.timestamp || new Date().toISOString(),
        },
        remediation: {
          action: 'LOCK_DEVICE',
          recommended: true,
        },
      });
    }

    // 2. Lock device (auto-remediation)
    if (enforcementActions.lockDevice !== false) {
      try {
        await this.remoteActionsService.createAutoAction({
          deviceId: device.id,
          tenantId: device.tenantId,
          actionType: RemoteActionType.LOCK_DEVICE,
          priority: RemoteActionPriority.URGENT,
          payload: {
            reason: 'GEOCURFEW_VIOLATION',
            message: `Device locked due to geocurfew policy violation: ${reason}`,
          },
          reason: `Auto-lock for geocurfew violation: ${policyName}`,
        });
      } catch (err) {
        console.error('Failed to lock device for geocurfew violation:', err);
      }
    }

    // 3. Send notification to user
    if (enforcementActions.sendNotification !== false) {
      try {
        await this.remoteActionsService.createAutoAction({
          deviceId: device.id,
          tenantId: device.tenantId,
          actionType: RemoteActionType.SEND_NOTIFICATION,
          priority: RemoteActionPriority.URGENT,
          payload: {
            title: 'Geocurfew Policy Violation',
            message: reason + '. Your device has been locked. Contact your IT administrator.',
            category: 'COMPLIANCE',
          },
          reason: `Geocurfew violation notification: ${policyName}`,
        });
      } catch (err) {
        console.error('Failed to send geocurfew notification:', err);
      }
    }

    // 4. Log audit event
    await this.auditService.logEvent({
      eventType: AuditEventType.POLICY_VIOLATION,
      tenantId: device.tenantId,
      deviceId: device.id,
      details: {
        policyType: PolicyType.GEOCURFEW,
        policyName,
        violationReason: reason,
        location,
        enforcementActions: {
          locked: enforcementActions.lockDevice !== false,
          notificationSent: enforcementActions.sendNotification !== false,
          alertCreated: enforcementActions.createAlert !== false,
        },
      },
    });
  }
}
