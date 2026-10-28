export enum SessionActivityState {
  ACTIVE = 'ACTIVE',
  IDLE = 'IDLE',
  LOCKED = 'LOCKED',
}

export interface DeviceUsageEvent {
  id: string;
  deviceId: string;
  tenantId: string;
  employeeId?: string;
  activeWindowProcess: string;
  activeWindowTitle: string;
  activeDurationSeconds: number;
  idleDurationSeconds: number;
  activityState: SessionActivityState;
  isWorkHours: boolean;
  timestamp: Date;
  provenanceHash: string;
  previousHash?: string;
  metadata?: Record<string, any>;
}

export interface IngestUsageEventsDto {
  events: Array<{
    activeWindowProcess: string;
    activeWindowTitle: string;
    activeDurationSeconds: number;
    idleDurationSeconds: number;
    activityState: SessionActivityState;
    timestamp: string;
    metadata?: Record<string, any>;
  }>;
}

export interface UsageSummaryReport {
  deviceId: string;
  deviceName?: string;
  periodStart: Date;
  periodEnd: Date;
  totalActiveSeconds: number;
  totalIdleSeconds: number;
  topApplications: Array<{
    processName: string;
    totalSeconds: number;
    percentage: number;
    isProductive?: boolean;
  }>;
  hourlyTimeline: Array<{
    hour: string;
    activeSeconds: number;
    idleSeconds: number;
  }>;
}
