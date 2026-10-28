import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { BluetoothScan } from '../database/entities/bt-scan.entity';

/**
 * Bluetooth Scan Service
 * 
 * Processes Bluetooth device scan results from Windows agents.
 * Provides security analysis, unauthorized device detection, and compliance monitoring.
 * 
 * Security Features:
 * - Unauthorized Bluetooth device detection
 * - Rogue device monitoring (BlueBorne, BlueBugs attacks)
 * - Data exfiltration risk detection
 * - Bluetooth beacon tracking (privacy concerns)
 * - Compliance verification (Bluetooth disabled in secure zones)
 * - Suspicious device pairing detection
 * 
 * Risk Classification:
 * - AUTHORIZED: Known/paired device on whitelist
 * - UNAUTHORIZED: Unknown device in proximity
 * - SUSPICIOUS: High-risk device type or behavior
 * - UNKNOWN: Cannot determine risk level
 */
@Injectable()
export class BluetoothScanService {
  private readonly logger = new Logger(BluetoothScanService.name);

  // Known legitimate device addresses (in production, fetch from database policy)
  private readonly authorizedDevices = new Set([
    // Example authorized devices (MAC addresses)
    // 'AA:BB:CC:DD:EE:FF',
    // '11:22:33:44:55:66',
  ]);

  // Known legitimate device names
  private readonly authorizedDeviceNames = new Set([
    'IT Admin Laptop',
    'Conference Room Speaker',
    'Corporate Headset',
  ]);

  // Suspicious device name patterns
  private readonly suspiciousNamePatterns = [
    /flipper/i,           // Flipper Zero (hacking device)
    /wifi.*pineapple/i,   // WiFi Pineapple (pentesting device)
    /rubber.*ducky/i,     // USB Rubber Ducky
    /bash.*bunny/i,       // Bash Bunny
    /lan.*turtle/i,       // LAN Turtle
    /ubertooth/i,         // Ubertooth (Bluetooth sniffer)
    /hackrf/i,            // HackRF (SDR device)
    /proxmark/i,          // Proxmark (RFID tool)
  ]);

  constructor(
    @InjectRepository(BluetoothScan)
    private readonly bluetoothScanRepository: Repository<BluetoothScan>,
  ) {}

  /**
   * Store Bluetooth scan results with security analysis
   */
  async storeScanResults(agentId: string, scanData: any): Promise<{ stored: number; flagged: number }> {
    try {
      const scannedAt = scanData.scannedAt ? new Date(scanData.scannedAt) : new Date();
      const devices = scanData.devices || [];

      let stored = 0;
      let flagged = 0;

      for (const deviceData of devices) {
        try {
          const detectedAt = deviceData.detectedAt ? new Date(deviceData.detectedAt) : scannedAt;
          const lastSeen = deviceData.lastSeen ? new Date(deviceData.lastSeen) : detectedAt;

          // Perform security analysis
          const securityAnalysis = this.analyzeDeviceSecurity(deviceData);

          const bluetoothScan = this.bluetoothScanRepository.create({
            agentId,
            name: deviceData.name,
            address: deviceData.address,
            deviceId: deviceData.deviceId,
            deviceType: deviceData.deviceType,
            classOfDevice: deviceData.classOfDevice,
            isPaired: deviceData.isPaired || false,
            isConnected: deviceData.isConnected || false,
            rssi: deviceData.rssi,
            riskLevel: securityAnalysis.riskLevel,
            isAuthorized: securityAnalysis.isAuthorized,
            isSuspicious: securityAnalysis.isSuspicious,
            threats: securityAnalysis.threats,
            lastSeen,
            detectedAt,
            scannedAt,
          });

          await this.bluetoothScanRepository.save(bluetoothScan);
          stored++;

          if (!securityAnalysis.isAuthorized || securityAnalysis.threats.length > 0) {
            flagged++;

            this.logger.warn(
              `Bluetooth Security Alert - Agent: ${agentId}, Device: ${deviceData.name}, ` +
              `Address: ${deviceData.address}, Risk: ${securityAnalysis.riskLevel}, ` +
              `Threats: [${securityAnalysis.threats.join(', ')}]`,
            );
          }
        } catch (error) {
          this.logger.error(`Failed to store device ${deviceData.name} for agent ${agentId}:`, error);
        }
      }

      this.logger.log(
        `Stored Bluetooth scan for agent ${agentId}: ${stored} devices, ${flagged} flagged`,
      );

      return { stored, flagged };
    } catch (error) {
      this.logger.error(`Failed to store Bluetooth scan results for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Analyze device security and assign risk level
   */
  private analyzeDeviceSecurity(deviceData: any): {
    riskLevel: string;
    isAuthorized: boolean;
    isSuspicious: boolean;
    threats: string[];
  } {
    const threats: string[] = [];
    let riskLevel = 'UNKNOWN';
    let isAuthorized = false;
    let isSuspicious = false;

    const name = deviceData.name || '';
    const address = deviceData.address || '';
    const isPaired = deviceData.isPaired || false;

    // Check if device is on authorized whitelist
    isAuthorized = this.authorizedDevices.has(address) || this.authorizedDeviceNames.has(name);

    // Threat 1: Unknown device (not paired, not authorized)
    if (!isPaired && !isAuthorized) {
      threats.push('UNKNOWN_DEVICE');
      riskLevel = 'UNAUTHORIZED';
    }

    // Threat 2: Suspicious device name (pentesting tools, hacking devices)
    for (const pattern of this.suspiciousNamePatterns) {
      if (pattern.test(name)) {
        threats.push('SUSPICIOUS_DEVICE_NAME');
        riskLevel = 'SUSPICIOUS';
        isSuspicious = true;
        break;
      }
    }

    // Threat 3: Data transfer risk (paired device can transfer files)
    if (isPaired && !isAuthorized) {
      threats.push('DATA_TRANSFER_RISK');
      if (riskLevel === 'UNKNOWN') {
        riskLevel = 'UNAUTHORIZED';
      }
    }

    // Threat 4: Unauthorized pairing
    if (isPaired && !isAuthorized) {
      threats.push('UNAUTHORIZED_PAIRING');
    }

    // Threat 5: Beacon tracking (BLE devices with strong signal)
    if (deviceData.deviceType === 'BLE' && deviceData.rssi && deviceData.rssi > -50) {
      threats.push('BEACON_TRACKING');
      if (riskLevel === 'UNKNOWN' && !isAuthorized) {
        riskLevel = 'SUSPICIOUS';
        isSuspicious = true;
      }
    }

    // Threat 6: Hidden/anonymous device (empty or generic name)
    const genericNames = ['Unknown Device', 'Unknown BLE Device', 'BT Device', 'Bluetooth Device'];
    if (!name || genericNames.includes(name)) {
      threats.push('ANONYMOUS_DEVICE');
      if (riskLevel === 'UNKNOWN') {
        riskLevel = 'SUSPICIOUS';
        isSuspicious = true;
      }
    }

    // Authorized devices are secure
    if (isAuthorized && threats.length === 0) {
      riskLevel = 'AUTHORIZED';
    }

    return {
      riskLevel,
      isAuthorized,
      isSuspicious,
      threats,
    };
  }

  /**
   * Get Bluetooth scans for an agent
   */
  async getAgentScans(
    agentId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<BluetoothScan[]> {
    return this.bluetoothScanRepository.find({
      where: { agentId },
      order: { scannedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get Bluetooth scans in time range
   */
  async getScansInRange(
    agentId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<BluetoothScan[]> {
    return this.bluetoothScanRepository.find({
      where: {
        agentId,
        scannedAt: Between(startDate, endDate),
      },
      order: { scannedAt: 'ASC' },
    });
  }

  /**
   * Get unauthorized/suspicious devices
   */
  async getUnauthorizedDevices(
    agentId?: string,
    limit: number = 100,
  ): Promise<BluetoothScan[]> {
    const queryBuilder = this.bluetoothScanRepository.createQueryBuilder('bluetooth_scan');

    queryBuilder.where('bluetooth_scan.isAuthorized = :isAuthorized', { isAuthorized: false });

    if (agentId) {
      queryBuilder.andWhere('bluetooth_scan.agentId = :agentId', { agentId });
    }

    queryBuilder.orderBy('bluetooth_scan.scannedAt', 'DESC');
    queryBuilder.limit(limit);

    return queryBuilder.getMany();
  }

  /**
   * Get suspicious devices
   */
  async getSuspiciousDevices(
    agentId?: string,
    limit: number = 100,
  ): Promise<BluetoothScan[]> {
    const where: any = { isSuspicious: true };
    if (agentId) {
      where.agentId = agentId;
    }

    return this.bluetoothScanRepository.find({
      where,
      order: { scannedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get paired devices for an agent
   */
  async getPairedDevices(
    agentId: string,
    limit: number = 100,
  ): Promise<BluetoothScan[]> {
    return this.bluetoothScanRepository.find({
      where: { agentId, isPaired: true },
      order: { scannedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Search devices by name
   */
  async searchByName(name: string, limit: number = 100): Promise<BluetoothScan[]> {
    const queryBuilder = this.bluetoothScanRepository.createQueryBuilder('bluetooth_scan');

    queryBuilder.where('bluetooth_scan.name LIKE :name', { name: `%${name}%` });
    queryBuilder.orderBy('bluetooth_scan.scannedAt', 'DESC');
    queryBuilder.limit(limit);

    return queryBuilder.getMany();
  }

  /**
   * Search devices by address (MAC address)
   */
  async searchByAddress(address: string, limit: number = 100): Promise<BluetoothScan[]> {
    return this.bluetoothScanRepository.find({
      where: { address },
      order: { scannedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get Bluetooth scan statistics for an agent
   */
  async getStatistics(agentId: string, days: number = 7): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const scans = await this.getScansInRange(agentId, startDate, new Date());

    const stats = {
      totalDevices: scans.length,
      uniqueDevices: new Set<string>(),
      deviceTypes: {} as Record<string, number>,
      classOfDeviceDistribution: {} as Record<string, number>,
      riskLevels: {} as Record<string, number>,
      pairedDevices: 0,
      connectedDevices: 0,
      authorizedDevices: 0,
      suspiciousDevices: 0,
      threatsSummary: {} as Record<string, number>,
      averageRSSI: 0,
    };

    let totalRSSI = 0;
    let rssiCount = 0;

    for (const scan of scans) {
      // Unique devices (by MAC address)
      stats.uniqueDevices.add(scan.address);

      // Device type distribution
      stats.deviceTypes[scan.deviceType] = (stats.deviceTypes[scan.deviceType] || 0) + 1;

      // Class of device distribution
      if (scan.classOfDevice) {
        stats.classOfDeviceDistribution[scan.classOfDevice] =
          (stats.classOfDeviceDistribution[scan.classOfDevice] || 0) + 1;
      }

      // Risk level distribution
      stats.riskLevels[scan.riskLevel] = (stats.riskLevels[scan.riskLevel] || 0) + 1;

      // Paired devices
      if (scan.isPaired) stats.pairedDevices++;

      // Connected devices
      if (scan.isConnected) stats.connectedDevices++;

      // Authorized devices
      if (scan.isAuthorized) stats.authorizedDevices++;

      // Suspicious devices
      if (scan.isSuspicious) stats.suspiciousDevices++;

      // Threats summary
      if (scan.threats) {
        for (const threat of scan.threats) {
          stats.threatsSummary[threat] = (stats.threatsSummary[threat] || 0) + 1;
        }
      }

      // RSSI average (BLE devices only)
      if (scan.rssi !== null) {
        totalRSSI += scan.rssi;
        rssiCount++;
      }
    }

    stats.averageRSSI = rssiCount > 0 ? Math.round(totalRSSI / rssiCount) : 0;

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
}
