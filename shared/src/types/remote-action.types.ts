export enum RemoteActionType {
  LOCK = 'LOCK',
  UNLOCK = 'UNLOCK',
  RESTART = 'RESTART',
  SHUTDOWN = 'SHUTDOWN',
  REFRESH_INVENTORY = 'REFRESH_INVENTORY',
  DIAGNOSTIC_BUNDLE = 'DIAGNOSTIC_BUNDLE',
  EXECUTE_COMMAND = 'EXECUTE_COMMAND',
  WIPE = 'WIPE',
  RETIRE = 'RETIRE',
  SYNC_POLICY = 'SYNC_POLICY',
  KILL_PROCESS = 'KILL_PROCESS',
  USB_LOCK = 'USB_LOCK',
  SEND_NOTIFICATION = 'SEND_NOTIFICATION',
  LOCATE_DEVICE = 'LOCATE_DEVICE',
  TAKE_SCREENSHOT = 'TAKE_SCREENSHOT',
  NETWORK_ISOLATE = 'NETWORK_ISOLATE',
  NETWORK_RESTORE = 'NETWORK_RESTORE',
  INSTALL_APK = 'INSTALL_APK',
  UNINSTALL_APK = 'UNINSTALL_APK',
  ENFORCE_VPN = 'ENFORCE_VPN',
  PUSH_WIFI = 'PUSH_WIFI',
  BLOCK_WIFI_CONFIG = 'BLOCK_WIFI_CONFIG',
  ENFORCE_PASSWORD = 'ENFORCE_PASSWORD',
  REMOTE_WALLPAPER = 'REMOTE_WALLPAPER',
  INSTALL_SOFTWARE = 'INSTALL_SOFTWARE',
  UNINSTALL_SOFTWARE = 'UNINSTALL_SOFTWARE',
}

export enum RemoteActionStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  DISPATCHED = 'DISPATCHED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum RemoteActionPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export interface RemoteAction {
  id: string;
  actionType: RemoteActionType;
  status: RemoteActionStatus;
  priority: RemoteActionPriority;
  payload?: Record<string, any>;
  result?: Record<string, any>;
  errorMessage?: string;
  requiresApproval: boolean;
  isApproved: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  scheduledAt?: Date;
  dispatchedAt?: Date;
  executedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deviceId: string;
  requestedBy: string;
  tenantId: string;
}

export interface CreateRemoteActionDto {
  deviceId: string;
  actionType: RemoteActionType;
  priority?: RemoteActionPriority;
  payload?: Record<string, any>;
  requiresApproval?: boolean;
}

export interface DeviceCommandPollResponse {
  commands: Array<{
    id: string;
    actionType: RemoteActionType;
    payload?: Record<string, any>;
  }>;
}

export interface DeviceCommandResultDto {
  commandId: string;
  status: RemoteActionStatus;
  result?: Record<string, any>;
  errorMessage?: string;
}
