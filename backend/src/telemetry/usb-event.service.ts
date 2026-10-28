import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { UsbEvent } from '../database/entities/usb-event.entity';

/**
 * USB Event Service
 * 
 * Processes USB device connection/disconnection events from Windows agents.
 * Provides security analysis, unauthorized device detection, and policy enforcement.
 * 
 * Security Features:
 * - Device whitelist/blacklist enforcement
 * - High-risk device type detection (STORAGE devices for data exfiltration)
 * - Unknown vendor detection
 * - Unauthorized device alerting
 * - Device tracking across agent fleet
 * 
 * Risk Classification:
 * - AUTHORIZED: Device matches whitelist or policy allows
 * - UNAUTHORIZED: Device violates explicit policy
 * - SUSPICIOUS: High-risk device type or unknown vendor
 * - UNKNOWN: No policy defined, default allow
 */
@Injectable()
export class UsbEventService {
  private readonly logger = new Logger(UsbEventService.name);

  // Known vendor IDs (VID) - major manufacturers
  private readonly knownVendors = new Set([
    '0781', // SanDisk
    '090C', // Silicon Motion (USB controllers)
    '8564', // Transcend
    '13FE', // Kingston
    '0930', // Toshiba
    '054C', // Sony
    '05DC', // Lexar
    '14CD', // Super Top (external enclosures)
    '174C', // ASMedia (USB bridges)
    '152D', // JMicron (USB-SATA bridges)
    '0BC2', // Seagate
    '1058', // Western Digital
    '059F', // LaCie
    '0424', // Microchip (SMSC)
    '046D', // Logitech
    '045E', // Microsoft
    '05AC', // Apple
    '04B4', // Cypress Semiconductor
    '1BCF', // Sunplus Innovation
    '0BDA', // Realtek
    '04F2', // Chicony Electronics
  ]);

  // High-risk device types for data exfiltration
  private readonly highRiskDeviceTypes = new Set([
    'STORAGE',
    'NETWORK',
    'SERIAL',
  ]);

  constructor(
    @InjectRepository(UsbEvent)
    private readonly usbEventRepository: Repository<UsbEvent>,
  ) {}

  /**
   * Store USB event with security analysis
   */
  async storeUsbEvent(agentId: string, eventData: any): Promise<UsbEvent> {
    try {
      const detectedAt = eventData.detectedAt ? new Date(eventData.detectedAt) : new Date();

      // Perform security analysis
      const securityAnalysis = this.analyzeDeviceSecurity(eventData);

      const usbEvent = this.usbEventRepository.create({
        agentId,
        eventType: eventData.eventType,
        deviceName: eventData.deviceName,
        deviceId: eventData.deviceId,
        description: eventData.description,
        manufacturer: eventData.manufacturer,
        vendorId: eventData.vendorId,
        productId: eventData.productId,
        serialNumber: eventData.serialNumber,
        deviceType: eventData.deviceType,
        status: eventData.status,
        riskLevel: securityAnalysis.riskLevel,
        isAuthorized: securityAnalysis.isAuthorized,
        isBlocked: securityAnalysis.isBlocked,
        matchedPolicyId: securityAnalysis.matchedPolicyId,
        threats: securityAnalysis.threats,
        detectedAt,
      });

      const saved = await this.usbEventRepository.save(usbEvent);

      this.logger.log(
        `Stored USB ${eventData.eventType} event: ${eventData.deviceName} ` +
        `(Type: ${eventData.deviceType}, Risk: ${securityAnalysis.riskLevel}) ` +
        `for agent ${agentId}`,
      );

      // Log security warnings
      if (!securityAnalysis.isAuthorized || securityAnalysis.threats.length > 0) {
        this.logger.warn(
          `USB Security Alert - Agent: ${agentId}, Device: ${eventData.deviceName}, ` +
          `Type: ${eventData.deviceType}, Risk: ${securityAnalysis.riskLevel}, ` +
          `Threats: [${securityAnalysis.threats.join(', ')}]`,
        );
      }

      return saved;
    } catch (error) {
      this.logger.error(`Failed to store USB event for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Store batch of USB events
   */
  async storeBatch(agentId: string, events: any[]): Promise<UsbEvent[]> {
    const results: UsbEvent[] = [];

    for (const eventData of events) {
      try {
        const saved = await this.storeUsbEvent(agentId, eventData);
        results.push(saved);
      } catch (error) {
        this.logger.error(`Failed to store USB event in batch for agent ${agentId}:`, error);
        // Continue processing other events
      }
    }

    return results;
  }

  /**
   * Analyze device security and assign risk level
   */
  private analyzeDeviceSecurity(eventData: any): {
    riskLevel: string;
    isAuthorized: boolean;
    isBlocked: boolean;
    matchedPolicyId: string | null;
    threats: string[];
  } {
    const threats: string[] = [];
    let riskLevel = 'UNKNOWN';
    let isAuthorized = true; // Default allow
    let isBlocked = false;
    let matchedPolicyId: string | null = null;

    // Threat 1: Unknown vendor (not in known vendors list)
    if (eventData.vendorId && !this.knownVendors.has(eventData.vendorId.toUpperCase())) {
      threats.push('UNKNOWN_VENDOR');
      riskLevel = 'SUSPICIOUS';
    }

    // Threat 2: High-risk device type (STORAGE = data exfiltration risk)
    if (this.highRiskDeviceTypes.has(eventData.deviceType)) {
      threats.push('DATA_EXFILTRATION_RISK');
      
      // STORAGE devices are especially risky
      if (eventData.deviceType === 'STORAGE') {
        threats.push('UNAUTHORIZED_STORAGE');
        riskLevel = 'UNAUTHORIZED';
        isAuthorized = false;
        
        // In production, this would query actual policy rules
        // For now, flag all external storage as unauthorized
        matchedPolicyId = 'default-no-storage';
      }
    }

    // Threat 3: NETWORK devices can bypass network policies
    if (eventData.deviceType === 'NETWORK') {
      threats.push('NETWORK_BYPASS_RISK');
      riskLevel = 'SUSPICIOUS';
    }

    // Threat 4: Missing vendor/product information
    if (!eventData.vendorId || !eventData.productId) {
      threats.push('INCOMPLETE_DEVICE_INFO');
      if (riskLevel === 'UNKNOWN') {
        riskLevel = 'SUSPICIOUS';
      }
    }

    // Threat 5: Device status errors
    if (eventData.status && eventData.status.toLowerCase().includes('error')) {
      threats.push('DEVICE_ERROR');
    }

    // In production environment, implement actual policy checking:
    // 1. Query policy rules from database
    // 2. Check device whitelist (by VID/PID, serial number, or device ID)
    // 3. Check device blacklist
    // 4. Apply role-based USB policies
    // 5. Check device type restrictions
    // 6. Enforce compliance requirements (e.g., HIPAA no-USB-storage)

    return {
      riskLevel,
      isAuthorized,
      isBlocked,
      matchedPolicyId,
      threats,
    };
  }

  /**
   * Get USB events for an agent
   */
  async getAgentUsbEvents(
    agentId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<UsbEvent[]> {
    return this.usbEventRepository.find({
      where: { agentId },
      order: { detectedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get USB events in time range
   */
  async getUsbEventsInRange(
    agentId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<UsbEvent[]> {
    return this.usbEventRepository.find({
      where: {
        agentId,
        detectedAt: Between(startDate, endDate),
      },
      order: { detectedAt: 'ASC' },
    });
  }

  /**
   * Get unauthorized USB events
   */
  async getUnauthorizedEvents(
    agentId?: string,
    limit: number = 100,
  ): Promise<UsbEvent[]> {
    const where: any = { isAuthorized: false };
    if (agentId) {
      where.agentId = agentId;
    }

    return this.usbEventRepository.find({
      where,
      order: { detectedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get currently connected USB devices for an agent
   * (devices with INSERTED event but no matching REMOVED event)
   */
  async getConnectedDevices(agentId: string): Promise<any[]> {
    // Get all USB events for the agent, ordered by time
    const events = await this.usbEventRepository.find({
      where: { agentId },
      order: { detectedAt: 'DESC' },
    });

    // Track device connection state
    const deviceStates = new Map<string, UsbEvent>();

    // Process events in reverse chronological order
    for (const event of events) {
      const deviceKey = event.deviceId;

      if (!deviceStates.has(deviceKey)) {
        // First occurrence (most recent event) determines current state
        if (event.eventType === 'INSERTED') {
          deviceStates.set(deviceKey, event);
        }
        // If REMOVED is most recent, device is disconnected (skip)
      }
    }

    // Return currently connected devices
    return Array.from(deviceStates.values()).map(event => ({
      deviceName: event.deviceName,
      deviceId: event.deviceId,
      deviceType: event.deviceType,
      manufacturer: event.manufacturer,
      vendorId: event.vendorId,
      productId: event.productId,
      serialNumber: event.serialNumber,
      connectedSince: event.detectedAt,
      riskLevel: event.riskLevel,
      isAuthorized: event.isAuthorized,
      threats: event.threats,
    }));
  }

  /**
   * Get USB event statistics for an agent
   */
  async getStatistics(agentId: string, days: number = 7): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const events = await this.getUsbEventsInRange(agentId, startDate, new Date());

    const stats = {
      totalEvents: events.length,
      insertions: 0,
      removals: 0,
      unauthorizedDevices: 0,
      deviceTypes: {} as Record<string, number>,
      riskLevels: {} as Record<string, number>,
      uniqueDevices: new Set<string>(),
      threatsSummary: {} as Record<string, number>,
    };

    for (const event of events) {
      // Event type counts
      if (event.eventType === 'INSERTED') {
        stats.insertions++;
      } else if (event.eventType === 'REMOVED') {
        stats.removals++;
      }

      // Unauthorized count
      if (!event.isAuthorized) {
        stats.unauthorizedDevices++;
      }

      // Device type distribution
      stats.deviceTypes[event.deviceType] = (stats.deviceTypes[event.deviceType] || 0) + 1;

      // Risk level distribution
      stats.riskLevels[event.riskLevel] = (stats.riskLevels[event.riskLevel] || 0) + 1;

      // Unique devices
      stats.uniqueDevices.add(event.deviceId);

      // Threats summary
      if (event.threats) {
        for (const threat of event.threats) {
          stats.threatsSummary[threat] = (stats.threatsSummary[threat] || 0) + 1;
        }
      }
    }

    return {
      ...stats,
      uniqueDevices: stats.uniqueDevices.size,
      timeRange: {
        start: startDate,
        end: new Date(),
        days,
      },
    };
  }

  /**
   * Search USB events by device characteristics
   */
  async searchDevices(filters: {
    agentId?: string;
    deviceType?: string;
    vendorId?: string;
    productId?: string;
    manufacturer?: string;
    riskLevel?: string;
    isAuthorized?: boolean;
    limit?: number;
  }): Promise<UsbEvent[]> {
    const queryBuilder = this.usbEventRepository.createQueryBuilder('usb_event');

    if (filters.agentId) {
      queryBuilder.andWhere('usb_event.agentId = :agentId', { agentId: filters.agentId });
    }

    if (filters.deviceType) {
      queryBuilder.andWhere('usb_event.deviceType = :deviceType', { deviceType: filters.deviceType });
    }

    if (filters.vendorId) {
      queryBuilder.andWhere('usb_event.vendorId = :vendorId', { vendorId: filters.vendorId });
    }

    if (filters.productId) {
      queryBuilder.andWhere('usb_event.productId = :productId', { productId: filters.productId });
    }

    if (filters.manufacturer) {
      queryBuilder.andWhere('usb_event.manufacturer LIKE :manufacturer', {
        manufacturer: `%${filters.manufacturer}%`,
      });
    }

    if (filters.riskLevel) {
      queryBuilder.andWhere('usb_event.riskLevel = :riskLevel', { riskLevel: filters.riskLevel });
    }

    if (filters.isAuthorized !== undefined) {
      queryBuilder.andWhere('usb_event.isAuthorized = :isAuthorized', {
        isAuthorized: filters.isAuthorized,
      });
    }

    queryBuilder.orderBy('usb_event.detectedAt', 'DESC');
    queryBuilder.limit(filters.limit || 100);

    return queryBuilder.getMany();
  }
}
