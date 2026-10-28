import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { WifiScan } from '../database/entities/wifi-scan.entity';

/**
 * Wi-Fi Scan Service
 * 
 * Processes Wi-Fi network scan results from Windows agents.
 * Provides security analysis, rogue AP detection, and network compliance verification.
 * 
 * Security Features:
 * - Rogue Access Point (AP) detection
 * - Evil Twin AP detection (suspicious SSIDs)
 * - Weak/open security detection (WEP, Open networks)
 * - Unauthorized network monitoring
 * - Network whitelist/blacklist enforcement
 * 
 * Risk Classification:
 * - SECURE: WPA2/WPA3 encryption
 * - WEAK: WEP encryption (deprecated, vulnerable)
 * - OPEN: No encryption (high risk for data interception)
 * - ROGUE: Unauthorized AP detected
 * - EVIL_TWIN: Suspicious AP mimicking legitimate network
 * - UNKNOWN: Cannot determine security level
 */
@Injectable()
export class WifiScanService {
  private readonly logger = new Logger(WifiScanService.name);

  // Known legitimate SSIDs (in production, fetch from database policy)
  private readonly authorizedNetworks = new Set([
    'CompanyWiFi',
    'CompanyWiFi-Guest',
    'CompanyWiFi-5GHz',
    'IT-Admin-Network',
  ]);

  // Suspicious SSID patterns that may indicate evil twin attacks
  private readonly suspiciousSsidPatterns = [
    /free.*wifi/i,
    /public.*wifi/i,
    /guest.*wifi/i,
    /open.*network/i,
    /xfinitywifi/i,
    /attwifi/i,
    /starbucks/i,
    /airport/i,
    /hotel/i,
  ];

  constructor(
    @InjectRepository(WifiScan)
    private readonly wifiScanRepository: Repository<WifiScan>,
  ) {}

  /**
   * Store Wi-Fi scan results with security analysis
   */
  async storeScanResults(agentId: string, scanData: any): Promise<{ stored: number; flagged: number }> {
    try {
      const scannedAt = scanData.scannedAt ? new Date(scanData.scannedAt) : new Date();
      const networks = scanData.networks || [];

      let stored = 0;
      let flagged = 0;

      for (const networkData of networks) {
        try {
          const detectedAt = networkData.detectedAt ? new Date(networkData.detectedAt) : scannedAt;

          // Perform security analysis
          const securityAnalysis = this.analyzeNetworkSecurity(networkData);

          const wifiScan = this.wifiScanRepository.create({
            agentId,
            ssid: networkData.ssid,
            bssid: networkData.bssid,
            signalQuality: networkData.signalQuality,
            rssi: networkData.rssi,
            channel: networkData.channel,
            frequency: networkData.frequency,
            securityType: networkData.securityType,
            isConnected: networkData.isConnected || false,
            networkType: networkData.networkType,
            riskLevel: securityAnalysis.riskLevel,
            isAuthorized: securityAnalysis.isAuthorized,
            isRogue: securityAnalysis.isRogue,
            threats: securityAnalysis.threats,
            detectedAt,
            scannedAt,
          });

          await this.wifiScanRepository.save(wifiScan);
          stored++;

          if (!securityAnalysis.isAuthorized || securityAnalysis.threats.length > 0) {
            flagged++;

            this.logger.warn(
              `Wi-Fi Security Alert - Agent: ${agentId}, SSID: ${networkData.ssid}, ` +
              `Security: ${networkData.securityType}, Risk: ${securityAnalysis.riskLevel}, ` +
              `Threats: [${securityAnalysis.threats.join(', ')}]`,
            );
          }
        } catch (error) {
          this.logger.error(`Failed to store network ${networkData.ssid} for agent ${agentId}:`, error);
        }
      }

      this.logger.log(
        `Stored Wi-Fi scan for agent ${agentId}: ${stored} networks, ${flagged} flagged`,
      );

      return { stored, flagged };
    } catch (error) {
      this.logger.error(`Failed to store Wi-Fi scan results for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Analyze network security and assign risk level
   */
  private analyzeNetworkSecurity(networkData: any): {
    riskLevel: string;
    isAuthorized: boolean;
    isRogue: boolean;
    threats: string[];
  } {
    const threats: string[] = [];
    let riskLevel = 'UNKNOWN';
    let isAuthorized = false;
    let isRogue = false;

    const ssid = networkData.ssid || '';
    const securityType = networkData.securityType || 'Unknown';

    // Check if network is on authorized whitelist
    isAuthorized = this.authorizedNetworks.has(ssid);

    // Threat 1: Open network (no encryption)
    if (securityType.toLowerCase() === 'open') {
      threats.push('OPEN_NETWORK');
      riskLevel = 'OPEN';
      
      if (!isAuthorized) {
        isRogue = true;
      }
    }

    // Threat 2: Weak encryption (WEP is deprecated and easily cracked)
    else if (securityType.toLowerCase().includes('wep')) {
      threats.push('WEAK_ENCRYPTION');
      riskLevel = 'WEAK';
      
      if (!isAuthorized) {
        isRogue = true;
      }
    }

    // Threat 3: Secure encryption (WPA2/WPA3)
    else if (securityType.toLowerCase().includes('wpa3')) {
      riskLevel = 'SECURE';
    }
    else if (securityType.toLowerCase().includes('wpa2')) {
      riskLevel = 'SECURE';
    }
    else if (securityType.toLowerCase().includes('wpa')) {
      riskLevel = 'WEAK'; // WPA (without 2 or 3) is less secure
      threats.push('OUTDATED_ENCRYPTION');
    }

    // Threat 4: Unknown SSID (not on whitelist)
    if (!isAuthorized && ssid) {
      threats.push('UNKNOWN_SSID');
      
      // Check for suspicious SSID patterns (evil twin indicators)
      for (const pattern of this.suspiciousSsidPatterns) {
        if (pattern.test(ssid)) {
          threats.push('EVIL_TWIN');
          riskLevel = 'EVIL_TWIN';
          isRogue = true;
          break;
        }
      }
    }

    // Threat 5: Rogue AP (unauthorized + open/weak security)
    if (!isAuthorized && (riskLevel === 'OPEN' || riskLevel === 'WEAK')) {
      threats.push('ROGUE_AP');
      isRogue = true;
    }

    // Threat 6: Hidden SSID (empty SSID)
    if (!ssid || ssid.trim() === '') {
      threats.push('HIDDEN_SSID');
    }

    // Threat 7: Strong signal from unauthorized network (nearby rogue AP)
    if (!isAuthorized && networkData.signalQuality > 70) {
      threats.push('STRONG_UNAUTHORIZED_SIGNAL');
    }

    return {
      riskLevel,
      isAuthorized,
      isRogue,
      threats,
    };
  }

  /**
   * Get Wi-Fi scans for an agent
   */
  async getAgentScans(
    agentId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<WifiScan[]> {
    return this.wifiScanRepository.find({
      where: { agentId },
      order: { scannedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get Wi-Fi scans in time range
   */
  async getScansInRange(
    agentId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<WifiScan[]> {
    return this.wifiScanRepository.find({
      where: {
        agentId,
        scannedAt: Between(startDate, endDate),
      },
      order: { scannedAt: 'ASC' },
    });
  }

  /**
   * Get rogue/unauthorized networks
   */
  async getRogueNetworks(
    agentId?: string,
    limit: number = 100,
  ): Promise<WifiScan[]> {
    const where: any = { isRogue: true };
    if (agentId) {
      where.agentId = agentId;
    }

    return this.wifiScanRepository.find({
      where,
      order: { scannedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get open/weak security networks
   */
  async getInsecureNetworks(
    agentId?: string,
    limit: number = 100,
  ): Promise<WifiScan[]> {
    const queryBuilder = this.wifiScanRepository.createQueryBuilder('wifi_scan');

    queryBuilder.where('wifi_scan.riskLevel IN (:...riskLevels)', {
      riskLevels: ['OPEN', 'WEAK'],
    });

    if (agentId) {
      queryBuilder.andWhere('wifi_scan.agentId = :agentId', { agentId });
    }

    queryBuilder.orderBy('wifi_scan.scannedAt', 'DESC');
    queryBuilder.limit(limit);

    return queryBuilder.getMany();
  }

  /**
   * Search networks by SSID
   */
  async searchBySSID(ssid: string, limit: number = 100): Promise<WifiScan[]> {
    return this.wifiScanRepository.find({
      where: { ssid },
      order: { scannedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Search networks by BSSID (MAC address of AP)
   */
  async searchByBSSID(bssid: string, limit: number = 100): Promise<WifiScan[]> {
    return this.wifiScanRepository.find({
      where: { bssid },
      order: { scannedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get Wi-Fi scan statistics for an agent
   */
  async getStatistics(agentId: string, days: number = 7): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const scans = await this.getScansInRange(agentId, startDate, new Date());

    const stats = {
      totalNetworks: scans.length,
      uniqueSSIDs: new Set<string>(),
      uniqueBSSIDs: new Set<string>(),
      securityTypes: {} as Record<string, number>,
      riskLevels: {} as Record<string, number>,
      rogueNetworks: 0,
      openNetworks: 0,
      authorizedNetworks: 0,
      connectedNetworks: 0,
      threatsSummary: {} as Record<string, number>,
      channelDistribution: {} as Record<number, number>,
      averageSignalQuality: 0,
    };

    let totalSignalQuality = 0;

    for (const scan of scans) {
      // Unique identifiers
      if (scan.ssid) stats.uniqueSSIDs.add(scan.ssid);
      if (scan.bssid) stats.uniqueBSSIDs.add(scan.bssid);

      // Security type distribution
      stats.securityTypes[scan.securityType] = (stats.securityTypes[scan.securityType] || 0) + 1;

      // Risk level distribution
      stats.riskLevels[scan.riskLevel] = (stats.riskLevels[scan.riskLevel] || 0) + 1;

      // Rogue networks
      if (scan.isRogue) stats.rogueNetworks++;

      // Open networks
      if (scan.riskLevel === 'OPEN') stats.openNetworks++;

      // Authorized networks
      if (scan.isAuthorized) stats.authorizedNetworks++;

      // Connected networks
      if (scan.isConnected) stats.connectedNetworks++;

      // Threats summary
      if (scan.threats) {
        for (const threat of scan.threats) {
          stats.threatsSummary[threat] = (stats.threatsSummary[threat] || 0) + 1;
        }
      }

      // Channel distribution
      if (scan.channel) {
        stats.channelDistribution[scan.channel] = (stats.channelDistribution[scan.channel] || 0) + 1;
      }

      // Signal quality
      totalSignalQuality += scan.signalQuality;
    }

    stats.averageSignalQuality = scans.length > 0 ? Math.round(totalSignalQuality / scans.length) : 0;

    return {
      ...stats,
      uniqueSSIDs: stats.uniqueSSIDs.size,
      uniqueBSSIDs: stats.uniqueBSSIDs.size,
      timeRange: {
        start: startDate,
        end: new Date(),
        days,
      },
    };
  }
}
