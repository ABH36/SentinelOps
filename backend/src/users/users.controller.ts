import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { UsersService, CreateUserDto, UpdateUserDto } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions('users.write')
  async create(@Body() createUserDto: CreateUserDto, @CurrentUser('id') creatorId: string) {
    return this.usersService.create(createUserDto, creatorId);
  }

  @Get()
  @RequirePermissions('users.read')
  async findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.usersService.findAll(tenantId);
  }

  @Get(':id')
  @RequirePermissions('users.read')
  async findOne(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.usersService.findOne(id, tenantId);
  }

  @Put(':id')
  @RequirePermissions('users.write')
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') updaterId: string,
  ) {
    return this.usersService.update(id, updateUserDto, tenantId, updaterId);
  }

  @Delete(':id')
  @RequirePermissions('users.delete')
  async remove(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') deleterId: string,
  ) {
    return this.usersService.remove(id, tenantId, deleterId);
  }

  @Post(':id/roles/:roleId')
  @RequirePermissions('roles.manage')
  async assignRole(
    @Param('id') userId: string,
    @Param('roleId') roleId: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') assignerId: string,
  ) {
    return this.usersService.assignRole(userId, roleId, tenantId, assignerId);
  }

  @Delete(':id/roles/:roleId')
  @RequirePermissions('roles.manage')
  async removeRole(
    @Param('id') userId: string,
    @Param('roleId') roleId: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') removerId: string,
  ) {
    return this.usersService.removeRole(userId, roleId, tenantId, removerId);
  }
}
