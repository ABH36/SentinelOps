export enum PolicyType {
  DEVICE = 'DEVICE',
  SOFTWARE = 'SOFTWARE',
  SECURITY = 'SECURITY',
  NETWORK = 'NETWORK',
  COMPLIANCE = 'COMPLIANCE',
  GEOCURFEW = 'GEOCURFEW',
}

export enum PolicySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum PolicyStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
  ARCHIVED = 'ARCHIVED',
}

export enum PolicyAssignmentScope {
  ALL_DEVICES = 'ALL_DEVICES',
  SPECIFIC_DEVICES = 'SPECIFIC_DEVICES',
  SPECIFIC_EMPLOYEES = 'SPECIFIC_EMPLOYEES',
  DEVICE_GROUP = 'DEVICE_GROUP',
  EMPLOYEE_GROUP = 'EMPLOYEE_GROUP',
}

export interface DevicePolicy {
  id: string;
  name: string;
  description?: string;
  policyType: PolicyType;
  severity: PolicySeverity;
  status: PolicyStatus;
  rules: Record<string, any>;
  metadata?: Record<string, any>;
  version?: string;
  isDefault: boolean;
  effectiveFrom?: Date;
  effectiveUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
  tenantId: string;
}

export interface PolicyAssignment {
  id: string;
  scope: PolicyAssignmentScope;
  status: string;
  priority?: number;
  policyId: string;
  deviceId?: string;
  employeeId?: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}
