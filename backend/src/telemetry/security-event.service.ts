import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThan, In } from 'typeorm';
import { SecurityEvent } from '../database/entities/security-event.entity';

/**
 * Security Event Service
 * 
 * Processes Windows Security Event Log entries collected from agents.
 * Provides threat detection, anomaly detection, and security incident analysis.
 * 
 * Monitored Events:
 * - 4624: Successful logon (detect unusual logon patterns)
 * - 4625: Failed logon (brute force detection)
 * - 4648: Explicit credentials (lateral movement)
 * - 4672: Special privileges (privilege escalation)
 * - 4720: User created (unauthorized account creation)
 * - 4732: Group membership (privilege escalation)
 * - 4688: Process created (malicious process detection)
 * - 4698: Scheduled task (persistence mechanism)
 * - 4104: PowerShell script (fileless malware, attack scripts)
 * - 7045: Service installed (persistence mechanism)
 * 
 * Threat Detection:
 * - Brute force attack detection (multiple 4625 events)
 * - Privilege escalation monitoring (4672, 4732)
 * - Lateral movement detection (4648, 4624 with unusual source IPs)
 * - Persistence mechanisms (4698, 7045)
 * - Malicious process creation (4688 with suspicious patterns)
 * - PowerShell-based attacks (4104 with obfuscation, encoded commands)
 * - Pass-the-hash attacks (4624/4648 with NTLM)
 * - Golden ticket attacks (4672 with unusual accounts)
 */
@Injectable()
export class SecurityEventService {
  private readonly logger = new Logger(SecurityEventService.name);

  // Suspicious PowerShell patterns
  private readonly suspiciousPowerShellPatterns = [
    /invoke-expression/i,
    /iex\s+\(/i,
    /downloadstring/i,
    /webclient/i,
    /-encodedcommand/i,
    /-enc\s+/i,
    /frombase64string/i,
    /invoke-mimikatz/i,
    /invoke-shellcode/i,
    /invoke-wmimethod/i,
    /invoke-cimmethod/i,
    /bypass.*execution.*policy/i,
    /reflection\.assembly/i,
    /system\.net\.sockets/i,
    /start-process.*-windowstyle.*hidden/i,
  ];

  // Suspicious process names/paths
  private readonly suspiciousProcessPatterns = [
    /psexec/i,
    /mimikatz/i,
    /procdump/i,
    /pwdump/i,
    /wce\.exe/i,
    /fgdump/i,
    /cachedump/i,
    /lsadump/i,
    /gsecdump/i,
    /ntdsutil/i,
    /vssadmin.*delete.*shadows/i,
    /wevtutil.*cl/i, // Event log clearing
    /cipher.*\/w/i, // Secure deletion
    /reg.*save.*sam/i, // SAM database dumping
    /reg.*save.*system/i,
    /\bcmd\.exe\b.*\/c.*echo/i, // Command execution via cmd
    /powershell\.exe.*-windowstyle.*hidden/i,
    /powershell\.exe.*bypass/i,
  ];

  // High-risk accounts that should rarely log on
  private readonly sensitiveAccounts = new Set([
    'administrator',
    'admin',
    'root',
    'sa',
    'krbtgt', // Golden ticket indicator
  ]);

  constructor(
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
  ) {}

  /**
   * Store batch of security events with threat analysis
   */
  async storeSecurityEvents(agentId: string, eventData: any): Promise<{ stored: number; flagged: number; threats: number }> {
    try {
      const collectedAt = eventData.collectedAt ? new Date(eventData.collectedAt) : new Date();
      const events = eventData.events || [];

      let stored = 0;
      let flagged = 0;
      let threats = 0;

      for (const event of events) {
        try {
          const eventTimestamp = event.timestamp ? new Date(event.timestamp) : collectedAt;

          // Perform threat analysis
          const threatAnalysis = this.analyzeThreat(event);

          const securityEvent = this.securityEventRepository.create({
            agentId,
            eventId: event.eventId,
            eventType: event.eventType,
            recordId: event.recordId || 0,
            level: event.level || 'Information',
            computer: event.computer,
            username: event.username || null,
            domain: event.domain || null,
            processName: event.processName || null,
            processId: event.processId || null,
            commandLine: event.commandLine ? event.commandLine.substring(0, 2000) : null, // Truncate to 2000 chars
            sourceIp: event.sourceIp || null,
            logonType: event.logonType || null,
            workstation: event.workstation || null,
            targetUsername: event.targetUsername || null,
            groupName: event.groupName || null,
            memberName: event.memberName || null,
            taskName: event.taskName || null,
            serviceName: event.serviceName || null,
            imagePath: event.imagePath || null,
            accountName: event.accountName || null,
            scriptBlock: event.scriptBlock ? event.scriptBlock.substring(0, 1000) : null, // Truncate to 1000 chars
            description: event.description ? event.description.substring(0, 5000) : null, // Truncate to 5000 chars
            properties: event.properties || null,
            riskLevel: threatAnalysis.riskLevel,
            isFlagged: threatAnalysis.isFlagged,
            threats: threatAnalysis.threats,
            eventTimestamp,
            collectedAt,
          });

          await this.securityEventRepository.save(securityEvent);
          stored++;

          if (threatAnalysis.isFlagged) {
            flagged++;
          }

          if (threatAnalysis.threats.length > 0) {
            threats++;

            this.logger.warn(
              `Security Threat Detected - Agent: ${agentId}, Event: ${event.eventType} (${event.eventId}), ` +
              `Risk: ${threatAnalysis.riskLevel}, Threats: [${threatAnalysis.threats.join(', ')}], ` +
              `Details: ${this.getThreatSummary(event)}`,
            );
          }
        } catch (error) {
          this.logger.error(`Failed to store security event ${event.eventId} for agent ${agentId}:`, error);
        }
      }

      if (stored > 0) {
        this.logger.log(
          `Stored ${stored} security events for agent ${agentId} ` +
          `(${flagged} flagged, ${threats} with threats)`,
        );
      }

      return { stored, flagged, threats };
    } catch (error) {
      this.logger.error(`Failed to store security events for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Analyze security event for threats
   */
  private analyzeThreat(event: any): { riskLevel: string; isFlagged: boolean; threats: string[] } {
    const threats: string[] = [];
    let riskLevel = 'LOW';
    let isFlagged = false;

    const eventId = event.eventId;
    const username = (event.username || '').toLowerCase();
    const processName = (event.processName || '').toLowerCase();
    const commandLine = (event.commandLine || '').toLowerCase();
    const scriptBlock = (event.scriptBlock || '').toLowerCase();
    const sourceIp = event.sourceIp || '';

    // Event-specific threat analysis
    switch (eventId) {
      case 4625: // Failed logon
        threats.push('FAILED_LOGON');
        riskLevel = 'MEDIUM';
        isFlagged = true;

        // Check for brute force indicators
        if (username && this.sensitiveAccounts.has(username)) {
          threats.push('SENSITIVE_ACCOUNT_FAILED_LOGON');
          riskLevel = 'HIGH';
        }
        break;

      case 4648: // Explicit credentials (RunAs)
        threats.push('EXPLICIT_CREDENTIALS_LOGON');
        riskLevel = 'MEDIUM';
        isFlagged = true;

        // Potential lateral movement
        if (event.targetUsername && event.targetUsername !== event.subjectUsername) {
          threats.push('LATERAL_MOVEMENT_INDICATOR');
          riskLevel = 'HIGH';
        }
        break;

      case 4672: // Special privileges
        if (username && this.sensitiveAccounts.has(username)) {
          threats.push('SENSITIVE_ACCOUNT_PRIVILEGE_ESCALATION');
          riskLevel = 'HIGH';
          isFlagged = true;
        } else {
          threats.push('PRIVILEGE_ESCALATION');
          riskLevel = 'MEDIUM';
          isFlagged = true;
        }
        break;

      case 4720: // User created
        threats.push('ACCOUNT_CREATED');
        riskLevel = 'MEDIUM';
        isFlagged = true;

        if (event.targetUsername && this.sensitiveAccounts.has(event.targetUsername.toLowerCase())) {
          threats.push('SENSITIVE_ACCOUNT_CREATED');
          riskLevel = 'HIGH';
        }
        break;

      case 4732: // Group membership change
        threats.push('GROUP_MEMBERSHIP_CHANGE');
        riskLevel = 'MEDIUM';
        isFlagged = true;

        // Check for Administrator group addition
        if ((event.groupName || '').toLowerCase().includes('admin')) {
          threats.push('ADMIN_GROUP_ADDITION');
          riskLevel = 'HIGH';
        }
        break;

      case 4688: // Process created
        // Check for suspicious process patterns
        if (this.suspiciousProcessPatterns.some(pattern => pattern.test(processName) || pattern.test(commandLine))) {
          threats.push('SUSPICIOUS_PROCESS');
          riskLevel = 'HIGH';
          isFlagged = true;
        }

        // Check for encoded PowerShell
        if (commandLine.includes('powershell') && (commandLine.includes('-enc') || commandLine.includes('-encodedcommand'))) {
          threats.push('ENCODED_POWERSHELL');
          riskLevel = 'HIGH';
          isFlagged = true;
        }

        // Check for hidden window
        if (commandLine.includes('-windowstyle') && commandLine.includes('hidden')) {
          threats.push('HIDDEN_WINDOW_PROCESS');
          riskLevel = 'MEDIUM';
          isFlagged = true;
        }

        // Check for remote execution tools
        if (/psexec|wmic|sc\.exe.*create/i.test(commandLine)) {
          threats.push('REMOTE_EXECUTION_TOOL');
          riskLevel = 'HIGH';
          isFlagged = true;
        }
        break;

      case 4698: // Scheduled task created
        threats.push('PERSISTENCE_MECHANISM');
        riskLevel = 'MEDIUM';
        isFlagged = true;

        // Check for suspicious task names
        if ((event.taskName || '').toLowerCase().includes('update') || 
            (event.taskName || '').toLowerCase().includes('system')) {
          threats.push('SUSPICIOUS_TASK_NAME');
          riskLevel = 'HIGH';
        }
        break;

      case 4104: // PowerShell script block
        // Check for suspicious PowerShell patterns
        if (this.suspiciousPowerShellPatterns.some(pattern => pattern.test(scriptBlock))) {
          threats.push('SUSPICIOUS_POWERSHELL');
          riskLevel = 'HIGH';
          isFlagged = true;
        }

        // Check for obfuscation
        if (scriptBlock.match(/\^\w+/g)?.length > 5) { // More than 5 caret characters (obfuscation)
          threats.push('OBFUSCATED_POWERSHELL');
          riskLevel = 'HIGH';
          isFlagged = true;
        }

        // Check for base64
        if (/frombase64string|::frombase64/i.test(scriptBlock)) {
          threats.push('BASE64_ENCODED_POWERSHELL');
          riskLevel = 'HIGH';
          isFlagged = true;
        }

        // Check for download cradle
        if (/(invoke-webrequest|wget|curl|downloadstring|downloadfile)/i.test(scriptBlock)) {
          threats.push('POWERSHELL_DOWNLOAD_CRADLE');
          riskLevel = 'HIGH';
          isFlagged = true;
        }
        break;

      case 7045: // Service installed
        threats.push('PERSISTENCE_MECHANISM');
        riskLevel = 'MEDIUM';
        isFlagged = true;

        // Check for suspicious service paths
        if ((event.imagePath || '').toLowerCase().includes('temp') ||
            (event.imagePath || '').toLowerCase().includes('appdata') ||
            (event.imagePath || '').toLowerCase().includes('programdata')) {
          threats.push('SUSPICIOUS_SERVICE_PATH');
          riskLevel = 'HIGH';
        }

        // Check for cmd.exe or powershell.exe as service
        if (/cmd\.exe|powershell\.exe/i.test(event.imagePath || '')) {
          threats.push('SUSPICIOUS_SERVICE_EXECUTABLE');
          riskLevel = 'HIGH';
        }
        break;

      case 4624: // Successful logon
        // Check for unusual logon types
        if (event.logonType === '3') { // Network logon
          // Check for unusual source IPs (in production, compare with baseline)
          if (sourceIp && !sourceIp.startsWith('192.168.') && !sourceIp.startsWith('10.') && sourceIp !== '127.0.0.1') {
            threats.push('EXTERNAL_NETWORK_LOGON');
            riskLevel = 'MEDIUM';
            isFlagged = true;
          }
        }

        // Check for sensitive account logon
        if (username && this.sensitiveAccounts.has(username)) {
          threats.push('SENSITIVE_ACCOUNT_LOGON');
          riskLevel = 'MEDIUM';
          isFlagged = true;
        }
        break;
    }

    // If no threats detected, mark as LOW risk
    if (threats.length === 0) {
      riskLevel = 'LOW';
      isFlagged = false;
    }

    return { riskLevel, isFlagged, threats };
  }

  /**
   * Get human-readable threat summary
   */
  private getThreatSummary(event: any): string {
    const parts: string[] = [];

    if (event.username) parts.push(`User: ${event.username}`);
    if (event.processName) parts.push(`Process: ${event.processName}`);
    if (event.sourceIp) parts.push(`Source IP: ${event.sourceIp}`);
    if (event.targetUsername) parts.push(`Target: ${event.targetUsername}`);
    if (event.groupName) parts.push(`Group: ${event.groupName}`);
    if (event.serviceName) parts.push(`Service: ${event.serviceName}`);
    if (event.taskName) parts.push(`Task: ${event.taskName}`);

    return parts.join(', ') || 'No details';
  }

  /**
   * Get security events for an agent
   */
  async getAgentSecurityEvents(
    agentId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<SecurityEvent[]> {
    return this.securityEventRepository.find({
      where: { agentId },
      order: { eventTimestamp: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get security events by event ID
   */
  async getSecurityEventsByEventId(
    agentId: string,
    eventId: number,
    limit: number = 100,
  ): Promise<SecurityEvent[]> {
    return this.securityEventRepository.find({
      where: { agentId, eventId },
      order: { eventTimestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get flagged security events (threats detected)
   */
  async getFlaggedSecurityEvents(
    agentId: string | null = null,
    limit: number = 100,
  ): Promise<SecurityEvent[]> {
    const where: any = { isFlagged: true };
    if (agentId) {
      where.agentId = agentId;
    }

    return this.securityEventRepository.find({
      where,
      order: { eventTimestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get high-risk security events
   */
  async getHighRiskEvents(
    agentId: string | null = null,
    limit: number = 100,
  ): Promise<SecurityEvent[]> {
    const where: any = { riskLevel: In(['HIGH', 'CRITICAL']) };
    if (agentId) {
      where.agentId = agentId;
    }

    return this.securityEventRepository.find({
      where,
      order: { eventTimestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get failed logon attempts (brute force detection)
   */
  async getFailedLogonAttempts(
    agentId: string,
    hours: number = 24,
    limit: number = 100,
  ): Promise<SecurityEvent[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.securityEventRepository.find({
      where: {
        agentId,
        eventId: 4625,
        eventTimestamp: MoreThan(since),
      },
      order: { eventTimestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get privilege escalation events
   */
  async getPrivilegeEscalationEvents(
    agentId: string,
    hours: number = 24,
    limit: number = 100,
  ): Promise<SecurityEvent[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.securityEventRepository.find({
      where: {
        agentId,
        eventId: In([4672, 4732]),
        eventTimestamp: MoreThan(since),
      },
      order: { eventTimestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get persistence mechanism events (scheduled tasks, services)
   */
  async getPersistenceEvents(
    agentId: string,
    hours: number = 24,
    limit: number = 100,
  ): Promise<SecurityEvent[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.securityEventRepository.find({
      where: {
        agentId,
        eventId: In([4698, 7045]),
        eventTimestamp: MoreThan(since),
      },
      order: { eventTimestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get PowerShell execution events
   */
  async getPowerShellEvents(
    agentId: string,
    hours: number = 24,
    limit: number = 100,
  ): Promise<SecurityEvent[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.securityEventRepository.find({
      where: {
        agentId,
        eventId: 4104,
        eventTimestamp: MoreThan(since),
      },
      order: { eventTimestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Search security events by username
   */
  async searchByUsername(
    username: string,
    limit: number = 100,
  ): Promise<SecurityEvent[]> {
    return this.securityEventRepository
      .createQueryBuilder('event')
      .where('LOWER(event.username) LIKE LOWER(:username)', { username: `%${username}%` })
      .orWhere('LOWER(event.targetUsername) LIKE LOWER(:username)', { username: `%${username}%` })
      .orderBy('event.eventTimestamp', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Get statistics for an agent
   */
  async getStatistics(agentId: string, days: number = 7): Promise<any> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      totalEvents,
      flaggedEvents,
      highRiskEvents,
      failedLogons,
      successfulLogons,
      privilegeEscalations,
      processCreations,
      persistenceMechanisms,
      powerShellExecutions,
    ] = await Promise.all([
      this.securityEventRepository.count({
        where: { agentId, eventTimestamp: MoreThan(since) },
      }),
      this.securityEventRepository.count({
        where: { agentId, isFlagged: true, eventTimestamp: MoreThan(since) },
      }),
      this.securityEventRepository.count({
        where: { agentId, riskLevel: In(['HIGH', 'CRITICAL']), eventTimestamp: MoreThan(since) },
      }),
      this.securityEventRepository.count({
        where: { agentId, eventId: 4625, eventTimestamp: MoreThan(since) },
      }),
      this.securityEventRepository.count({
        where: { agentId, eventId: 4624, eventTimestamp: MoreThan(since) },
      }),
      this.securityEventRepository.count({
        where: { agentId, eventId: In([4672, 4732]), eventTimestamp: MoreThan(since) },
      }),
      this.securityEventRepository.count({
        where: { agentId, eventId: 4688, eventTimestamp: MoreThan(since) },
      }),
      this.securityEventRepository.count({
        where: { agentId, eventId: In([4698, 7045]), eventTimestamp: MoreThan(since) },
      }),
      this.securityEventRepository.count({
        where: { agentId, eventId: 4104, eventTimestamp: MoreThan(since) },
      }),
    ]);

    return {
      totalEvents,
      flaggedEvents,
      highRiskEvents,
      failedLogons,
      successfulLogons,
      privilegeEscalations,
      processCreations,
      persistenceMechanisms,
      powerShellExecutions,
      period: `Last ${days} days`,
    };
  }
}
