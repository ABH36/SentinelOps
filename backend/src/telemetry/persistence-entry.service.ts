import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, In } from 'typeorm';
import { PersistenceEntry } from '../database/entities/persistence-entry.entity';

/**
 * Persistence Entry Service
 * 
 * Processes Windows persistence mechanism entries from agents.
 * Provides threat analysis, change tracking, and security monitoring.
 * 
 * Persistence Mechanisms Monitored:
 * - Registry Run/RunOnce keys (HKLM/HKCU)
 * - Startup folders (system and user)
 * - Windows Services (automatic start)
 * - Scheduled Tasks
 * 
 * Threat Detection:
 * - Suspicious file locations (temp, downloads)
 * - Script execution mechanisms (.vbs, .js, .ps1)
 * - Obfuscated PowerShell commands
 * - Remote download indicators
 * - Missing executable files
 * - DLL execution techniques
 * - System account services
 * 
 * Use Cases:
 * - Malware persistence detection
 * - Unauthorized software monitoring
 * - Compliance enforcement
 * - Incident response
 * - Baseline deviation detection
 */
@Injectable()
export class PersistenceEntryService {
  private readonly logger = new Logger(PersistenceEntryService.name);

  constructor(
    @InjectRepository(PersistenceEntry)
    private readonly persistenceEntryRepository: Repository<PersistenceEntry>,
  ) {}

  /**
   * Store persistence scan results
   */
  async storePersistenceScan(agentId: string, scanData: any): Promise<{ stored: number; suspicious: number; added: number; modified: number; removed: number }> {
    try {
      const scannedAt = scanData.scannedAt ? new Date(scanData.scannedAt) : new Date();
      const entries = scanData.entries || [];

      let stored = 0;
      let suspicious = 0;
      let added = 0;
      let modified = 0;
      let removed = 0;

      for (const entry of entries) {
        try {
          const entryScannedAt = entry.scannedAt ? new Date(entry.scannedAt) : scannedAt;

          const persistenceEntry = this.persistenceEntryRepository.create({
            agentId,
            type: entry.type,
            location: entry.location,
            name: entry.name,
            displayName: entry.displayName || null,
            command: entry.command,
            filePath: entry.filePath || null,
            fileHash: entry.fileHash || null,
            startMode: entry.startMode || null,
            serviceState: entry.serviceState || null,
            serviceAccount: entry.serviceAccount || null,
            taskStatus: entry.taskStatus || null,
            taskAuthor: entry.taskAuthor || null,
            threats: entry.threats || [],
            riskScore: entry.riskScore || 0,
            riskLevel: entry.riskLevel || 'NONE',
            isSuspicious: entry.isSuspicious || false,
            changeType: entry.changeType || '',
            scannedAt: entryScannedAt,
          });

          await this.persistenceEntryRepository.save(persistenceEntry);
          stored++;

          if (persistenceEntry.isSuspicious) {
            suspicious++;
          }

          // Count change types
          switch (entry.changeType) {
            case 'ADDED':
              added++;
              this.logger.warn(
                `New persistence mechanism detected - Agent: ${agentId}, Type: ${entry.type}, ` +
                `Name: ${entry.name}, Location: ${entry.location}, Risk: ${entry.riskLevel}` +
                (entry.threats?.length > 0 ? `, Threats: [${entry.threats.join(', ')}]` : ''),
              );
              break;
            case 'MODIFIED':
              modified++;
              this.logger.warn(
                `Persistence mechanism modified - Agent: ${agentId}, Type: ${entry.type}, ` +
                `Name: ${entry.name}`,
              );
              break;
            case 'REMOVED':
              removed++;
              this.logger.info(
                `Persistence mechanism removed - Agent: ${agentId}, Type: ${entry.type}, ` +
                `Name: ${entry.name}`,
              );
              break;
          }
        } catch (error) {
          this.logger.error(`Failed to store persistence entry ${entry.name} for agent ${agentId}:`, error);
        }
      }

      if (stored > 0) {
        this.logger.log(
          `Stored ${stored} persistence entries for agent ${agentId} ` +
          `(${suspicious} suspicious, ${added} added, ${modified} modified, ${removed} removed)`,
        );
      }

      return { stored, suspicious, added, modified, removed };
    } catch (error) {
      this.logger.error(`Failed to store persistence scan for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Get persistence entries for an agent
   */
  async getAgentPersistenceEntries(
    agentId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<PersistenceEntry[]> {
    return this.persistenceEntryRepository.find({
      where: { agentId },
      order: { scannedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get persistence entries by type
   */
  async getEntriesByType(
    agentId: string,
    type: string,
    limit: number = 100,
  ): Promise<PersistenceEntry[]> {
    return this.persistenceEntryRepository.find({
      where: { agentId, type },
      order: { scannedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get suspicious persistence entries
   */
  async getSuspiciousEntries(
    agentId: string | null = null,
    limit: number = 100,
  ): Promise<PersistenceEntry[]> {
    const where: any = { isSuspicious: true };
    if (agentId) {
      where.agentId = agentId;
    }

    return this.persistenceEntryRepository.find({
      where,
      order: { riskScore: 'DESC', scannedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get high-risk persistence entries
   */
  async getHighRiskEntries(
    agentId: string | null = null,
    limit: number = 100,
  ): Promise<PersistenceEntry[]> {
    const where: any = { riskLevel: In(['MEDIUM', 'HIGH']) };
    if (agentId) {
      where.agentId = agentId;
    }

    return this.persistenceEntryRepository.find({
      where,
      order: { riskScore: 'DESC', scannedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get recently added persistence entries
   */
  async getRecentlyAdded(
    agentId: string,
    hours: number = 24,
    limit: number = 100,
  ): Promise<PersistenceEntry[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.persistenceEntryRepository.find({
      where: {
        agentId,
        changeType: 'ADDED',
        scannedAt: MoreThan(since),
      },
      order: { scannedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get recently modified persistence entries
   */
  async getRecentlyModified(
    agentId: string,
    hours: number = 24,
    limit: number = 100,
  ): Promise<PersistenceEntry[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.persistenceEntryRepository.find({
      where: {
        agentId,
        changeType: 'MODIFIED',
        scannedAt: MoreThan(since),
      },
      order: { scannedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get recently removed persistence entries
   */
  async getRecentlyRemoved(
    agentId: string,
    hours: number = 24,
    limit: number = 100,
  ): Promise<PersistenceEntry[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.persistenceEntryRepository.find({
      where: {
        agentId,
        changeType: 'REMOVED',
        scannedAt: MoreThan(since),
      },
      order: { scannedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Search persistence entries by file hash
   */
  async searchByFileHash(
    fileHash: string,
    limit: number = 100,
  ): Promise<PersistenceEntry[]> {
    return this.persistenceEntryRepository.find({
      where: { fileHash },
      order: { scannedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Search persistence entries by name
   */
  async searchByName(
    name: string,
    limit: number = 100,
  ): Promise<PersistenceEntry[]> {
    return this.persistenceEntryRepository
      .createQueryBuilder('entry')
      .where('LOWER(entry.name) LIKE LOWER(:name)', { name: `%${name}%` })
      .orderBy('entry.scannedAt', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Search persistence entries by command
   */
  async searchByCommand(
    command: string,
    limit: number = 100,
  ): Promise<PersistenceEntry[]> {
    return this.persistenceEntryRepository
      .createQueryBuilder('entry')
      .where('LOWER(entry.command) LIKE LOWER(:command)', { command: `%${command}%` })
      .orderBy('entry.scannedAt', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Get statistics for an agent
   */
  async getStatistics(agentId: string, days: number = 7): Promise<any> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      totalEntries,
      suspiciousEntries,
      highRiskEntries,
      registryEntries,
      startupEntries,
      serviceEntries,
      taskEntries,
      addedEntries,
      modifiedEntries,
      removedEntries,
    ] = await Promise.all([
      this.persistenceEntryRepository.count({
        where: { agentId, scannedAt: MoreThan(since) },
      }),
      this.persistenceEntryRepository.count({
        where: { agentId, isSuspicious: true, scannedAt: MoreThan(since) },
      }),
      this.persistenceEntryRepository.count({
        where: { agentId, riskLevel: In(['MEDIUM', 'HIGH']), scannedAt: MoreThan(since) },
      }),
      this.persistenceEntryRepository.count({
        where: { agentId, type: 'Registry', scannedAt: MoreThan(since) },
      }),
      this.persistenceEntryRepository.count({
        where: { agentId, type: 'Startup Folder', scannedAt: MoreThan(since) },
      }),
      this.persistenceEntryRepository.count({
        where: { agentId, type: 'Service', scannedAt: MoreThan(since) },
      }),
      this.persistenceEntryRepository.count({
        where: { agentId, type: 'Scheduled Task', scannedAt: MoreThan(since) },
      }),
      this.persistenceEntryRepository.count({
        where: { agentId, changeType: 'ADDED', scannedAt: MoreThan(since) },
      }),
      this.persistenceEntryRepository.count({
        where: { agentId, changeType: 'MODIFIED', scannedAt: MoreThan(since) },
      }),
      this.persistenceEntryRepository.count({
        where: { agentId, changeType: 'REMOVED', scannedAt: MoreThan(since) },
      }),
    ]);

    // Get threat distribution
    const threatStats = await this.persistenceEntryRepository
      .createQueryBuilder('entry')
      .select('entry.threats')
      .where('entry.agentId = :agentId', { agentId })
      .andWhere('entry.scannedAt > :since', { since })
      .andWhere('entry.threats IS NOT NULL')
      .getMany();

    const threatCounts: Record<string, number> = {};
    threatStats.forEach(entry => {
      if (entry.threats) {
        entry.threats.forEach(threat => {
          threatCounts[threat] = (threatCounts[threat] || 0) + 1;
        });
      }
    });

    return {
      totalEntries,
      suspiciousEntries,
      highRiskEntries,
      byType: {
        registry: registryEntries,
        startupFolder: startupEntries,
        service: serviceEntries,
        scheduledTask: taskEntries,
      },
      changes: {
        added: addedEntries,
        modified: modifiedEntries,
        removed: removedEntries,
      },
      threatDistribution: threatCounts,
      period: `Last ${days} days`,
    };
  }

  /**
   * Get unique file hashes across all agents (for threat intelligence)
   */
  async getSuspiciousFileHashes(limit: number = 100): Promise<{ fileHash: string; count: number; entries: PersistenceEntry[] }[]> {
    const suspiciousEntries = await this.persistenceEntryRepository.find({
      where: { isSuspicious: true },
      order: { scannedAt: 'DESC' },
      take: limit * 10, // Get more to group by hash
    });

    // Group by file hash
    const hashGroups: Record<string, PersistenceEntry[]> = {};
    suspiciousEntries.forEach(entry => {
      if (entry.fileHash) {
        if (!hashGroups[entry.fileHash]) {
          hashGroups[entry.fileHash] = [];
        }
        hashGroups[entry.fileHash].push(entry);
      }
    });

    // Convert to array and sort by count
    const result = Object.keys(hashGroups).map(hash => ({
      fileHash: hash,
      count: hashGroups[hash].length,
      entries: hashGroups[hash].slice(0, 5), // Include up to 5 sample entries
    }));

    result.sort((a, b) => b.count - a.count);
    return result.slice(0, limit);
  }

  /**
   * Get baseline persistence entries for comparison
   */
  async getBaseline(agentId: string): Promise<PersistenceEntry[]> {
    // Get the most recent full scan (entries without changeType)
    return this.persistenceEntryRepository.find({
      where: {
        agentId,
        changeType: '',
      },
      order: { scannedAt: 'DESC' },
      take: 1000, // Get up to 1000 baseline entries
    });
  }
}
