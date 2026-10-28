import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../database/entities/user.entity';
import { Role } from '../database/entities/role.entity';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '@shared/types/audit.types';

export interface CreateUserDto {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  tenantId: string;
}

export interface UpdateUserDto {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly auditService: AuditService,
  ) {}

  async create(createUserDto: CreateUserDto, creatorId: string): Promise<User> {
    // Check if user exists
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email, tenantId: createUserDto.tenantId },
    });

    if (existingUser) {
      throw new ConflictException('User already exists in this tenant');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(createUserDto.password, 10);

    const user = this.userRepository.create({
      ...createUserDto,
      passwordHash,
    });

    const savedUser = await this.userRepository.save(user);

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.USER_CREATED,
      tenantId: savedUser.tenantId,
      userId: creatorId,
      details: { email: savedUser.email, targetUserId: savedUser.id },
    });

    return savedUser;
  }

  async findAll(tenantId: string): Promise<User[]> {
    return this.userRepository.find({
      where: { tenantId },
      relations: ['roles', 'roles.permissions'],
      select: {
        passwordHash: false,
        mfaSecret: false,
      },
    });
  }

  async findOne(id: string, tenantId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id, tenantId },
      relations: ['roles', 'roles.permissions'],
      select: {
        passwordHash: false,
        mfaSecret: false,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto, tenantId: string, updaterId: string): Promise<User> {
    const user = await this.findOne(id, tenantId);

    if (updateUserDto.password) {
      user.passwordHash = await bcrypt.hash(updateUserDto.password, 10);
      delete updateUserDto.password;
    }

    Object.assign(user, updateUserDto);
    const updatedUser = await this.userRepository.save(user);

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.USER_UPDATED,
      tenantId: user.tenantId,
      userId: updaterId,
      details: { email: user.email, targetUserId: user.id },
    });

    return updatedUser;
  }

  async remove(id: string, tenantId: string, deleterId: string): Promise<void> {
    const user = await this.findOne(id, tenantId);

    await this.userRepository.remove(user);

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.USER_DELETED,
      tenantId: user.tenantId,
      userId: deleterId,
      details: { email: user.email, targetUserId: user.id },
    });
  }

  async assignRole(userId: string, roleId: string, tenantId: string, assignerId: string): Promise<User> {
    const user = await this.findOne(userId, tenantId);
    const role = await this.roleRepository.findOne({
      where: { id: roleId, tenantId },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (!user.roles) {
      user.roles = [];
    }

    if (!user.roles.some((r) => r.id === roleId)) {
      user.roles.push(role);
      await this.userRepository.save(user);

      // Audit log
      await this.auditService.logEvent({
        eventType: AuditEventType.PERMISSION_GRANTED,
        tenantId: user.tenantId,
        userId: assignerId,
        details: {
          email: user.email,
          targetUserId: user.id,
          roleName: role.name,
        },
      });
    }

    return user;
  }

  async removeRole(userId: string, roleId: string, tenantId: string, removerId: string): Promise<User> {
    const user = await this.findOne(userId, tenantId);

    user.roles = user.roles.filter((r) => r.id !== roleId);
    await this.userRepository.save(user);

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.PERMISSION_REVOKED,
      tenantId: user.tenantId,
      userId: removerId,
      details: {
        email: user.email,
        targetUserId: user.id,
        roleId,
      },
    });

    return user;
  }
}
