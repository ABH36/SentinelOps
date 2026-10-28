export enum EnrollmentStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
}

export interface EnrollmentToken {
  token: string;
  expiresAt: Date;
  deviceId?: string;
}

export interface DeviceEnrollment {
  id: string;
  enrollmentToken: string;
  status: EnrollmentStatus;
  expiresAt?: Date;
  enrolledAt?: Date;
  revokedAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  deviceId: string;
}

export interface DeviceCredential {
  id: string;
  deviceKey: string;
  deviceSecret: string;
  keyFingerprint?: string;
  isActive: boolean;
  expiresAt?: Date;
  rotatedAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  enrollmentId: string;
}

export interface EnrollmentRequest {
  token: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  osVersion?: string;
  hardwareInfo?: Record<string, any>;
}

export interface EnrollmentResponse {
  success: boolean;
  credential?: {
    deviceKey: string;
    deviceSecret: string;
  };
  error?: string;
}
