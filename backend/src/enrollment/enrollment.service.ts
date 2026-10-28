import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { DeviceEnrollment } from '../database/entities/device-enrollment.entity';
import { DeviceCredential } from '../database/entities/device-credential.entity';
import { Device } from '../database/entities/device.entity';
import { DeviceStatus } from '@shared/types/device.types';
import { DevicesService } from '../devices/devices.service';
import { AuditService } from '../audit/audit.service';
import { EnrollmentStatus } from '@shared/types/enrollment.types';
import { AuditEventType } from '@shared/types/audit.types';

export interface CreateEnrollmentTokenDto {
  deviceId?: string;
  expiresHours?: number;
}

export interface GenerateInstallLinkDto {
  label?: string;
  expiresHours?: number;
  maxUses?: number;
  platform?: 'windows' | 'android' | 'both';
}

export interface InstallLinkResponse {
  token: string;
  expiresAt: Date;
  maxUses?: number;
  links: {
    windows: string;
    android: string;
    universal: string;
    windowsScript: string;
  };
  qrCodes: {
    simpleInstall: string;
    deviceOwner: string;
  };
  powershellOneLiner: string;
  emailTemplate: string;
}

export interface EnrollmentRequestDto {
  token: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  osVersion?: string;
  hardwareInfo?: Record<string, any>;
}

@Injectable()
export class EnrollmentService {
  constructor(
    @InjectRepository(DeviceEnrollment)
    private readonly enrollmentRepository: Repository<DeviceEnrollment>,
    @InjectRepository(DeviceCredential)
    private readonly credentialRepository: Repository<DeviceCredential>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly devicesService: DevicesService,
    private readonly auditService: AuditService,
  ) {}

  async createToken(tenantId: string, creatorId: string, dto: CreateEnrollmentTokenDto): Promise<{ token: string; expiresAt: Date }> {
    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');

    // Calculate expiration
    const expiresHours = dto.expiresHours || 24;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresHours);

    // Create enrollment record without deviceId initially
    const enrollment = this.enrollmentRepository.create({
      enrollmentToken: token,
      status: EnrollmentStatus.PENDING,
      expiresAt,
      deviceId: dto.deviceId,
      metadata: { tenantId, targetDeviceId: dto.deviceId },
    });

    const savedEnrollment = await this.enrollmentRepository.save(enrollment);

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.ENROLLMENT_TOKEN_CREATED,
      tenantId,
      userId: creatorId,
      details: {
        enrollmentId: savedEnrollment.id,
        expiresAt: savedEnrollment.expiresAt,
        targetDeviceId: dto.deviceId,
      },
    });

    return {
      token,
      expiresAt: savedEnrollment.expiresAt,
    };
  }

  async validateToken(token: string, tenantId?: string): Promise<DeviceEnrollment> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { enrollmentToken: token },
      relations: ['device'],
    });

    if (!enrollment) {
      throw new UnauthorizedException('Invalid enrollment token');
    }

    if (enrollment.status !== EnrollmentStatus.PENDING) {
      throw new BadRequestException('Token already used or revoked');
    }

    if (enrollment.expiresAt && enrollment.expiresAt < new Date()) {
      enrollment.status = EnrollmentStatus.EXPIRED;
      await this.enrollmentRepository.save(enrollment);
      throw new BadRequestException('Token expired');
    }

    return enrollment;
  }

  async enrollDevice(
    enrollmentRequest: EnrollmentRequestDto,
    tenantId?: string,
    ipAddress?: string,
  ): Promise<{ deviceKey: string; deviceSecret: string; deviceId: string }> {
    // Validate token
    const enrollment = await this.validateToken(enrollmentRequest.token, tenantId);

    // Use tenant from enrollment metadata or device relation
    const actualTenantId = tenantId || enrollment.metadata?.tenantId || enrollment.device?.tenantId || '';

    // Check if device already exists
    let device;
    if (enrollment.deviceId) {
      device = await this.deviceRepository.findOne({
        where: { deviceId: enrollment.deviceId, tenantId: actualTenantId },
      });
    }

    if (!device) {
      // Create new device
      device = this.deviceRepository.create({
        deviceId: enrollmentRequest.deviceId,
        deviceName: enrollmentRequest.deviceName,
        platform: enrollmentRequest.platform as any,
        osVersion: enrollmentRequest.osVersion || '',
        tenantId: actualTenantId,
        status: DeviceStatus.ACTIVE,
        metadata: { hardwareInfo: enrollmentRequest.hardwareInfo },
      });
      device = await this.deviceRepository.save(device);
    } else {
      // Update existing device
      device.deviceName = enrollmentRequest.deviceName;
      if (enrollmentRequest.osVersion) {
        device.osVersion = enrollmentRequest.osVersion;
      }
      device.status = DeviceStatus.ACTIVE;
      device.metadata = { hardwareInfo: enrollmentRequest.hardwareInfo };
      device = await this.deviceRepository.save(device);
    }

    // Generate device credentials
    const deviceKey = crypto.randomBytes(16).toString('hex');
    const deviceSecret = crypto.randomBytes(32).toString('hex');
    const keyFingerprint = crypto.createHash('sha256').update(deviceKey + deviceSecret).digest('hex');

    const credential = this.credentialRepository.create({
      deviceKey,
      deviceSecret,
      keyFingerprint,
      isActive: true,
      enrollmentId: enrollment.id,
    });

    await this.credentialRepository.save(credential);

    // Update enrollment status
    enrollment.status = EnrollmentStatus.ACTIVE;
    enrollment.enrolledAt = new Date();
    enrollment.deviceId = device.id;
    await this.enrollmentRepository.save(enrollment);

    // Update device last seen
    await this.devicesService.updateLastSeen(device.id, actualTenantId, ipAddress);

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.ENROLLMENT_TOKEN_USED,
      tenantId: actualTenantId,
      deviceId: device.id,
      details: {
        enrollmentId: enrollment.id,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
      },
      ipAddress,
    });

    return {
      deviceKey,
      deviceSecret,
      deviceId: device.id,
    };
  }

  async revokeToken(token: string, tenantId: string, revokerId: string): Promise<void> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { enrollmentToken: token },
    });

    if (!enrollment) {
      throw new NotFoundException('Enrollment token not found');
    }

    enrollment.status = EnrollmentStatus.REVOKED;
    enrollment.revokedAt = new Date();
    await this.enrollmentRepository.save(enrollment);

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.ENROLLMENT_TOKEN_REVOKED,
      tenantId,
      userId: revokerId,
      details: { enrollmentId: enrollment.id },
    });
  }

  async getActiveEnrollment(deviceId: string, tenantId: string): Promise<DeviceEnrollment> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { deviceId, status: EnrollmentStatus.ACTIVE },
      relations: ['credential'],
    });

    if (!enrollment) {
      throw new NotFoundException('No active enrollment found for device');
    }

    return enrollment;
  }

  async verifyCredential(deviceKey: string, deviceSecret: string): Promise<Device> {
    const credential = await this.credentialRepository.findOne({
      where: { deviceKey, deviceSecret, isActive: true },
      relations: ['enrollment', 'enrollment.device'],
    });

    if (!credential) {
      throw new UnauthorizedException('Invalid device credentials');
    }

    if (credential.expiresAt && credential.expiresAt < new Date()) {
      throw new UnauthorizedException('Device credentials expired');
    }

    if (!credential.enrollment || !credential.enrollment.device) {
      throw new NotFoundException('Device not found');
    }

    return credential.enrollment.device;
  }

  async getAndroidDpcProvisioningJson(tokenId: string): Promise<any> {
    // Validate token exists and is pending
    const enrollment = await this.validateToken(tokenId);

    // Extract tenant details from metadata
    const tenantId = enrollment.metadata?.tenantId || 'default';
    const apiEndpoint = process.env.API_ENDPOINT || 'https://api.sentinelops.com';
    const apkUrl = process.env.ANDROID_APK_URL || `${apiEndpoint}/downloads/sentinelops-agent.apk`;
    const apkSha256 = process.env.ANDROID_APK_SHA256 || '';

    // Build DPC provisioning JSON according to Android DPC extras spec
    // https://developers.google.com/android/management/provision-device
    const provisioningData = {
      'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': 
        'com.sentinelops.agent/com.sentinelops.agent.admin.SentinelDeviceAdminReceiver',
      'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': apkUrl,
      'android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM': apkSha256,
      'android.app.extra.PROVISIONING_SKIP_ENCRYPTION': false,
      'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED': true,
      'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE': {
        tenantId,
        apiEndpoint,
        enrollmentToken: tokenId,
      },
    };

    // Optionally include Wi-Fi credentials if configured
    const corpWifiSsid = process.env.CORP_WIFI_SSID;
    const corpWifiPassword = process.env.CORP_WIFI_PASSWORD;
    
    if (corpWifiSsid && corpWifiPassword) {
      provisioningData['android.app.extra.PROVISIONING_WIFI_SSID'] = corpWifiSsid;
      provisioningData['android.app.extra.PROVISIONING_WIFI_PASSWORD'] = corpWifiPassword;
    }

    return provisioningData;
  }

  async generateInstallLink(
    tenantId: string,
    creatorId: string,
    dto: GenerateInstallLinkDto,
  ): Promise<InstallLinkResponse> {
    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');

    // Calculate expiration
    const expiresHours = dto.expiresHours || 24;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresHours);

    // Create enrollment record with metadata
    const enrollment = this.enrollmentRepository.create({
      enrollmentToken: token,
      status: EnrollmentStatus.PENDING,
      expiresAt,
      metadata: {
        tenantId,
        label: dto.label || 'Deployment Link',
        maxUses: dto.maxUses,
        platform: dto.platform || 'both',
        createdBy: creatorId,
      },
    });

    await this.enrollmentRepository.save(enrollment);

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.ENROLLMENT_TOKEN_CREATED,
      tenantId,
      userId: creatorId,
      details: {
        enrollmentId: enrollment.id,
        label: dto.label,
        platform: dto.platform,
        maxUses: dto.maxUses,
        expiresAt: enrollment.expiresAt,
      },
    });

    // Build response with all links and templates
    const apiEndpoint = process.env.API_ENDPOINT || 'https://api.sentinelops.com';
    const baseUrl = apiEndpoint.replace('/api', '');

    const links = {
      windows: `${baseUrl}/install/windows?token=${token}`,
      android: `${baseUrl}/install/android?token=${token}`,
      universal: `${baseUrl}/install?token=${token}`,
      windowsScript: `${baseUrl}/install/windows-ps1?token=${token}`,
    };

    const qrCodes = {
      simpleInstall: links.android,
      deviceOwner: `${apiEndpoint}/enrollment/android-qr/${token}`,
    };

    const powershellOneLiner = `iex (iwr '${links.windowsScript}' -UseBasicParsing).Content`;

    const emailTemplate = this.generateEmailTemplate(token, links, expiresAt, dto.label);

    return {
      token,
      expiresAt,
      maxUses: dto.maxUses,
      links,
      qrCodes,
      powershellOneLiner,
      emailTemplate,
    };
  }

  private generateEmailTemplate(
    token: string,
    links: any,
    expiresAt: Date,
    label?: string,
  ): string {
    const expiryDate = expiresAt.toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .button { display: inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 10px 5px; }
    .button:hover { background: #4338ca; }
    .info-box { background: white; border-left: 4px solid #4f46e5; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .instructions { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .code { background: #1f2937; color: #10b981; padding: 15px; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 13px; overflow-x: auto; margin: 10px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 15px 0; border-radius: 4px; color: #92400e; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">🛡️ SentinelOps Device Enrollment</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">${label || 'Your device is ready to be enrolled'}</p>
    </div>
    
    <div class="content">
      <div class="info-box">
        <strong>📋 Enrollment Token:</strong>
        <div style="font-family: monospace; margin-top: 8px; word-break: break-all;">${token}</div>
        <div style="margin-top: 10px; font-size: 13px; color: #6b7280;">
          ⏰ Valid until: <strong>${expiryDate}</strong>
        </div>
      </div>

      <h2 style="color: #1f2937; margin-top: 30px;">🪟 Windows Installation</h2>
      <div class="instructions">
        <p><strong>Option 1: One-Click PowerShell Command (Recommended)</strong></p>
        <p style="font-size: 14px; color: #6b7280;">Open PowerShell as Administrator and run:</p>
        <div class="code">${links.windowsScript.replace('iex (iwr \'', '').replace('\' -UseBasicParsing).Content', '')}</div>
        
        <p style="margin-top: 20px;"><strong>Option 2: Download Installer</strong></p>
        <a href="${links.windows}" class="button">⬇️ Download Windows Installer</a>
      </div>

      <h2 style="color: #1f2937; margin-top: 30px;">📱 Android Installation</h2>
      <div class="instructions">
        <p><strong>For Existing Devices:</strong></p>
        <p style="font-size: 14px; color: #6b7280;">
          1. Open this email on your Android device<br>
          2. Tap the button below to download the agent<br>
          3. Install and open the app (may require "Unknown Sources" permission)
        </p>
        <a href="${links.android}" class="button">📲 Download Android Agent</a>
        
        <div class="warning" style="margin-top: 20px;">
          <strong>⚠️ For New/Factory-Reset Devices:</strong><br>
          During Android setup wizard, tap the welcome screen 6 times to activate the QR scanner. Contact your IT administrator for the zero-touch provisioning QR code.
        </div>
      </div>

      <h2 style="color: #1f2937; margin-top: 30px;">❓ Need Help?</h2>
      <div class="instructions">
        <p style="font-size: 14px;">
          • Installation takes 2-3 minutes<br>
          • Enrollment happens automatically after installation<br>
          • Contact IT support if you encounter any issues<br>
          • This token expires on <strong>${expiryDate}</strong>
        </p>
      </div>
    </div>
    
    <div class="footer">
      <p>This is an automated enrollment email from SentinelOps MDM Platform</p>
      <p style="margin-top: 5px;">Do not share this token with unauthorized users</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  async getAllEnrollmentTokens(tenantId: string): Promise<any[]> {
    const enrollments = await this.enrollmentRepository.find({
      where: { metadata: { tenantId } as any },
      relations: ['device'],
      order: { createdAt: 'DESC' },
    });

    return enrollments.map((enrollment) => ({
      id: enrollment.id,
      token: enrollment.enrollmentToken,
      label: enrollment.metadata?.label || 'Unlabeled',
      platform: enrollment.metadata?.platform || 'both',
      createdBy: enrollment.metadata?.createdBy || 'Unknown',
      createdAt: enrollment.createdAt,
      expiresAt: enrollment.expiresAt,
      status: enrollment.status,
      maxUses: enrollment.metadata?.maxUses,
      deviceId: enrollment.deviceId,
      deviceName: enrollment.device?.deviceName,
      enrolledAt: enrollment.enrolledAt,
      revokedAt: enrollment.revokedAt,
    }));
  }
}
