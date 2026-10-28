export enum DevicePlatform {
  WINDOWS = 'WINDOWS',
  ANDROID = 'ANDROID',
}

export enum DeviceStatus {
  ENROLLING = 'ENROLLING',
  ACTIVE = 'ACTIVE',
  OFFLINE = 'OFFLINE',
  LOCKED = 'LOCKED',
  RETIRED = 'RETIRED',
}

export interface Device {
  id: string;
  deviceId: string;
  deviceName: string;
  platform: DevicePlatform;
  osVersion?: string;
  status: DeviceStatus;
  lastSeenAt?: Date;
  ipAddress?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
  assignedEmployeeId?: string;
}

export interface DeviceHardware {
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  cpu?: string;
  cpuCores?: number;
  ram?: number;
  storage?: number;
  storageType?: string;
  batteryHealth?: number;
}

export interface DeviceOS {
  name?: string;
  version?: string;
  build?: string;
  architecture?: string;
  kernelVersion?: string;
}

export interface DeviceNetwork {
  macAddress?: string;
  ipAddress?: string;
  hostname?: string;
  networkInterfaces?: Array<{
    name: string;
    macAddress: string;
    ipAddress: string;
  }>;
}

export interface DeviceSoftware {
  installedApplications?: Array<{
    name: string;
    version: string;
    publisher?: string;
    installDate?: string;
  }>;
  updatesAvailable?: number;
}

export interface DeviceSecurity {
  antivirus?: string;
  firewallEnabled?: boolean;
  lastScanDate?: string;
  encryptionEnabled?: boolean;
}

export interface DeviceAgent {
  version?: string;
  installDate?: string;
  lastUpdate?: string;
}

export interface DeviceInventory {
  id: string;
  hardware: DeviceHardware;
  operatingSystem: DeviceOS;
  network: DeviceNetwork;
  software?: DeviceSoftware;
  security?: DeviceSecurity;
  agent?: DeviceAgent;
  metadata?: Record<string, any>;
  createdAt: Date;
  deviceId: string;
}

export interface DeviceHealth {
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  batteryLevel?: number;
  batteryStatus?: string;
  uptime?: number;
}

export interface DeviceConnectivity {
  latency?: number;
  networkSpeed?: number;
  isConnected?: boolean;
  connectionType?: string;
}

export interface DeviceAgentStatus {
  status?: string;
  lastCommand?: string;
  pendingCommands?: number;
  errors?: string[];
}

export interface DeviceHeartbeat {
  id: string;
  health: DeviceHealth;
  connectivity?: DeviceConnectivity;
  agent?: DeviceAgentStatus;
  metadata?: Record<string, any>;
  createdAt: Date;
  deviceId: string;
}
