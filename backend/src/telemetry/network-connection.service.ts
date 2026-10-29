import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, In } from 'typeorm';
import { NetworkConnection } from '../database/entities/network-connection.entity';

/**
 * Network Connection Service
 * Handles storage and querying of network connection telemetry
 */
@Injectable()
export class NetworkConnectionService {
  private readonly logger = new Logger(NetworkConnectionService.name);

  constructor(
    @InjectRepository(NetworkConnection)
    private readonly networkConnectionRepository: Repository<NetworkConnection>,
  ) {}

  /**
   * Store network connections from agent telemetry
   */
  async storeNetworkConnections(agentId: string, payload: any): Promise<void> {
    try {
      const connections = payload.connections || [];
      
      if (connections.length === 0) {
        this.logger.debug(`No connections to store for agent ${agentId}`);
        return;
      }

      const entities = connections.map((conn: any) => {
        const entity = new NetworkConnection();
        entity.agentId = agentId;
        entity.protocol = conn.protocol;
        entity.localAddress = conn.localAddress;
        entity.localPort = conn.localPort;
        entity.remoteAddress = conn.remoteAddress;
        entity.remotePort = conn.remotePort;
        entity.state = conn.state;
        entity.pid = conn.pid;
        entity.processName = conn.processName;
        entity.processPath = conn.processPath;
        entity.country = conn.country;
        entity.city = conn.city;
        entity.isp = conn.isp;
        entity.isThreatIp = conn.isThreatIp || false;
        entity.threatReason = conn.threatReason;
        entity.capturedAt = new Date(conn.capturedAt);
        return entity;
      });

      await this.networkConnectionRepository.save(entities);

      const threatCount = entities.filter(e => e.isThreatIp).length;
      if (threatCount > 0) {
        this.logger.warn(
          `Stored ${connections.length} network connections for agent ${agentId} - ${threatCount} THREATS DETECTED`,
        );
      } else {
        this.logger.log(
          `Stored ${connections.length} network connections for agent ${agentId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to store network connections for agent ${agentId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get all network connections for a specific agent
   */
  async getAgentConnections(
    agentId: string,
    limit: number = 1000,
    offset: number = 0,
  ): Promise<NetworkConnection[]> {
    return this.networkConnectionRepository.find({
      where: { agentId },
      order: { capturedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get active connections (ESTABLISHED state)
   */
  async getActiveConnections(
    agentId: string,
    limit: number = 500,
  ): Promise<NetworkConnection[]> {
    return this.networkConnectionRepository.find({
      where: { 
        agentId,
        state: 'ESTABLISHED',
      },
      order: { capturedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get connections by process name
   */
  async getConnectionsByProcess(
    agentId: string,
    processName: string,
    limit: number = 500,
  ): Promise<NetworkConnection[]> {
    return this.networkConnectionRepository
      .createQueryBuilder('conn')
      .where('conn.agentId = :agentId', { agentId })
      .andWhere('LOWER(conn.processName) LIKE LOWER(:processName)', {
        processName: `%${processName}%`,
      })
      .orderBy('conn.capturedAt', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * Get threat connections (flagged as threats)
   */
  async getThreatConnections(
    agentId?: string,
    limit: number = 500,
  ): Promise<NetworkConnection[]> {
    const query = this.networkConnectionRepository
      .createQueryBuilder('conn')
      .where('conn.isThreatIp = :isThreat', { isThreat: true });

    if (agentId) {
      query.andWhere('conn.agentId = :agentId', { agentId });
    }

    return query
      .orderBy('conn.capturedAt', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * Get connections by country
   */
  async getConnectionsByCountry(
    agentId: string,
    country: string,
    limit: number = 500,
  ): Promise<NetworkConnection[]> {
    return this.networkConnectionRepository.find({
      where: { 
        agentId,
        country,
      },
      order: { capturedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get connections by remote address
   */
  async getConnectionsByRemoteAddress(
    remoteAddress: string,
    limit: number = 500,
  ): Promise<NetworkConnection[]> {
    return this.networkConnectionRepository.find({
      where: { remoteAddress },
      order: { capturedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get recent connections (last N hours)
   */
  async getRecentConnections(
    agentId: string,
    hours: number = 24,
  ): Promise<NetworkConnection[]> {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    return this.networkConnectionRepository.find({
      where: {
        agentId,
        capturedAt: MoreThan(since),
      },
      order: { capturedAt: 'DESC' },
    });
  }

  /**
   * Get network connection statistics for an agent
   */
  async getStatistics(agentId: string, hours: number = 24): Promise<any> {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    const connections = await this.networkConnectionRepository.find({
      where: {
        agentId,
        capturedAt: MoreThan(since),
      },
    });

    // Calculate statistics
    const totalConnections = connections.length;
    const threatConnections = connections.filter(c => c.isThreatIp).length;
    const establishedConnections = connections.filter(c => c.state === 'ESTABLISHED').length;
    const listeningConnections = connections.filter(c => c.state === 'LISTENING').length;

    // Protocol breakdown
    const tcpConnections = connections.filter(c => c.protocol === 'TCP').length;
    const udpConnections = connections.filter(c => c.protocol === 'UDP').length;

    // Country distribution
    const countryMap = new Map<string, number>();
    connections.forEach(conn => {
      if (conn.country) {
        countryMap.set(conn.country, (countryMap.get(conn.country) || 0) + 1);
      }
    });

    const topCountries = Array.from(countryMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Process distribution
    const processMap = new Map<string, number>();
    connections.forEach(conn => {
      if (conn.processName) {
        processMap.set(conn.processName, (processMap.get(conn.processName) || 0) + 1);
      }
    });

    const topProcesses = Array.from(processMap.entries())
      .map(([processName, count]) => ({ processName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Remote port distribution (common services)
    const portMap = new Map<number, number>();
    connections.forEach(conn => {
      if (conn.remotePort) {
        portMap.set(conn.remotePort, (portMap.get(conn.remotePort) || 0) + 1);
      }
    });

    const topPorts = Array.from(portMap.entries())
      .map(([port, count]) => ({ port, count, service: this.getServiceName(port) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Threat reasons distribution
    const threatReasonMap = new Map<string, number>();
    connections
      .filter(c => c.isThreatIp && c.threatReason)
      .forEach(conn => {
        threatReasonMap.set(conn.threatReason, (threatReasonMap.get(conn.threatReason) || 0) + 1);
      });

    const threatReasons = Array.from(threatReasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    return {
      agentId,
      periodHours: hours,
      summary: {
        totalConnections,
        threatConnections,
        establishedConnections,
        listeningConnections,
        tcpConnections,
        udpConnections,
        threatPercentage: totalConnections > 0 
          ? ((threatConnections / totalConnections) * 100).toFixed(2) 
          : '0.00',
      },
      topCountries,
      topProcesses,
      topPorts,
      threatReasons,
    };
  }

  /**
   * Get unique threat IPs for threat intelligence sharing
   */
  async getThreatIps(hours: number = 24): Promise<any[]> {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    const threats = await this.networkConnectionRepository
      .createQueryBuilder('conn')
      .select('conn.remoteAddress', 'remoteAddress')
      .addSelect('COUNT(DISTINCT conn.agentId)', 'affectedAgents')
      .addSelect('COUNT(*)', 'occurrences')
      .addSelect('MAX(conn.threatReason)', 'threatReason')
      .addSelect('MAX(conn.country)', 'country')
      .addSelect('MAX(conn.city)', 'city')
      .addSelect('MAX(conn.isp)', 'isp')
      .where('conn.isThreatIp = :isThreat', { isThreat: true })
      .andWhere('conn.capturedAt > :since', { since })
      .groupBy('conn.remoteAddress')
      .orderBy('occurrences', 'DESC')
      .getRawMany();

    return threats.map(threat => ({
      remoteAddress: threat.remoteAddress,
      affectedAgents: parseInt(threat.affectedAgents, 10),
      occurrences: parseInt(threat.occurrences, 10),
      threatReason: threat.threatReason,
      country: threat.country,
      city: threat.city,
      isp: threat.isp,
    }));
  }

  /**
   * Search connections by multiple criteria
   */
  async searchConnections(
    filters: {
      agentId?: string;
      protocol?: string;
      remoteAddress?: string;
      processName?: string;
      state?: string;
      country?: string;
      isThreatIp?: boolean;
    },
    limit: number = 500,
  ): Promise<NetworkConnection[]> {
    const query = this.networkConnectionRepository.createQueryBuilder('conn');

    if (filters.agentId) {
      query.andWhere('conn.agentId = :agentId', { agentId: filters.agentId });
    }

    if (filters.protocol) {
      query.andWhere('conn.protocol = :protocol', { protocol: filters.protocol });
    }

    if (filters.remoteAddress) {
      query.andWhere('conn.remoteAddress LIKE :remoteAddress', {
        remoteAddress: `%${filters.remoteAddress}%`,
      });
    }

    if (filters.processName) {
      query.andWhere('LOWER(conn.processName) LIKE LOWER(:processName)', {
        processName: `%${filters.processName}%`,
      });
    }

    if (filters.state) {
      query.andWhere('conn.state = :state', { state: filters.state });
    }

    if (filters.country) {
      query.andWhere('conn.country = :country', { country: filters.country });
    }

    if (filters.isThreatIp !== undefined) {
      query.andWhere('conn.isThreatIp = :isThreatIp', { isThreatIp: filters.isThreatIp });
    }

    return query
      .orderBy('conn.capturedAt', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * Get common service name for port
   */
  private getServiceName(port: number): string {
    const commonPorts: { [key: number]: string } = {
      21: 'FTP',
      22: 'SSH',
      23: 'Telnet',
      25: 'SMTP',
      53: 'DNS',
      80: 'HTTP',
      110: 'POP3',
      143: 'IMAP',
      443: 'HTTPS',
      445: 'SMB',
      3306: 'MySQL',
      3389: 'RDP',
      5432: 'PostgreSQL',
      5900: 'VNC',
      8080: 'HTTP-Alt',
      8443: 'HTTPS-Alt',
    };

    return commonPorts[port] || 'Unknown';
  }
}
