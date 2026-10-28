export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

export enum AlertStatus {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED',
  IGNORED = 'IGNORED',
  ESCALATED = 'ESCALATED',
}

export enum AlertCategory {
  DEVICE_OFFLINE = 'DEVICE_OFFLINE',
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  SECURITY = 'SECURITY',
  PERFORMANCE = 'PERFORMANCE',
  DEPLOYMENT = 'DEPLOYMENT',
  COMPLIANCE = 'COMPLIANCE',
  SYSTEM = 'SYSTEM',
}

export interface Alert {
  id: string;
  title: string;
  description?: string;
  severity: AlertSeverity;
  status: AlertStatus;
  category: AlertCategory;
  details?: Record<string, any>;
  metrics?: Record<string, any>;
  remediation?: Record<string, any>;
  occurrenceCount: number;
  firstOccurrenceAt?: Date;
  lastOccurrenceAt?: Date;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  acknowledgmentNote?: string;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNote?: string;
  createdAt: Date;
  updatedAt: Date;
  deviceId?: string;
  policyId?: string;
  tenantId: string;
}
