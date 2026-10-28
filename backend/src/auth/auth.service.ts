import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { User } from '../database/entities/user.entity';
import { Tenant } from '../database/entities/tenant.entity';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '@shared/types/audit.types';

export interface LoginDto {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  tenantId?: string;
}

export interface MfaSetupDto {
  secret: string;
  qrCode: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    isMfaEnabled: boolean;
    tenantId: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: ['tenant', 'roles', 'roles.permissions'],
    });

    if (!user || !user.isActive) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string): Promise<AuthResponse> {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check MFA if enabled
    if (user.isMfaEnabled) {
      if (!loginDto.mfaCode) {
        throw new BadRequestException('MFA code required');
      }

      const isMfaValid = speakeasy.totp.verify({
        secret: user.mfaSecret,
        encoding: 'base32',
        token: loginDto.mfaCode,
        window: 2,
      });

      if (!isMfaValid) {
        throw new UnauthorizedException('Invalid MFA code');
      }
    }

    // Update last login
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    // Generate tokens
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      roles: user.roles.map((r) => r.name),
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.USER_LOGIN,
      tenantId: user.tenantId,
      userId: user.id,
      ipAddress,
      userAgent,
      details: { email: user.email },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isMfaEnabled: user.isMfaEnabled,
        tenantId: user.tenantId,
      },
    };
  }

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    // Check if user exists
    const existingUser = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    // If no tenant provided, create default tenant
    let tenantId = registerDto.tenantId;
    if (!tenantId) {
      const tenant = this.tenantRepository.create({
        name: 'Default Organization',
      });
      const savedTenant = await this.tenantRepository.save(tenant);
      tenantId = savedTenant.id;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(registerDto.password, 10);

    // Create user
    const user = this.userRepository.create({
      email: registerDto.email,
      passwordHash,
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
      tenantId,
    });

    const savedUser = await this.userRepository.save(user);

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.USER_CREATED,
      tenantId: savedUser.tenantId,
      userId: savedUser.id,
      details: { email: savedUser.email },
    });

    // Generate tokens
    const payload = {
      sub: savedUser.id,
      email: savedUser.email,
      tenantId: savedUser.tenantId,
      roles: [],
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      accessToken,
      refreshToken,
      user: {
        id: savedUser.id,
        email: savedUser.email,
        firstName: savedUser.firstName,
        lastName: savedUser.lastName,
        isMfaEnabled: savedUser.isMfaEnabled,
        tenantId: savedUser.tenantId,
      },
    };
  }

  async setupMfa(userId: string): Promise<MfaSetupDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.isMfaEnabled) {
      throw new BadRequestException('MFA already enabled');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `SentinelOps (${user.email})`,
      issuer: 'SentinelOps',
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url || '');

    // Temporarily store secret (not yet enabled)
    user.mfaSecret = secret.base32;
    await this.userRepository.save(user);

    return {
      secret: secret.base32,
      qrCode,
    };
  }

  async enableMfa(userId: string, code: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.mfaSecret) {
      throw new BadRequestException('MFA not set up');
    }

    // Verify code
    const isValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!isValid) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    // Enable MFA
    user.isMfaEnabled = true;
    await this.userRepository.save(user);

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.USER_MFA_ENABLED,
      tenantId: user.tenantId,
      userId: user.id,
      details: { email: user.email },
    });
  }

  async disableMfa(userId: string, code: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isMfaEnabled) {
      throw new BadRequestException('MFA not enabled');
    }

    // Verify code
    const isValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!isValid) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    // Disable MFA
    user.isMfaEnabled = false;
    user.mfaSecret = null as any;
    await this.userRepository.save(user);

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.USER_MFA_DISABLED,
      tenantId: user.tenantId,
      userId: user.id,
      details: { email: user.email },
    });
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      const payload = this.jwtService.verify(refreshToken);

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
        relations: ['tenant', 'roles', 'roles.permissions'],
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid token');
      }

      // Generate new tokens
      const newPayload = {
        sub: user.id,
        email: user.email,
        tenantId: user.tenantId,
        roles: user.roles.map((r) => r.name),
      };

      const accessToken = this.jwtService.sign(newPayload);
      const newRefreshToken = this.jwtService.sign(newPayload, { expiresIn: '7d' });

      return {
        accessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isMfaEnabled: user.isMfaEnabled,
          tenantId: user.tenantId,
        },
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
