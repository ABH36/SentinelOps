import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditEventType } from '@shared/types/audit.types';

@Controller('audit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  async findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('eventType') eventType?: AuditEventType,
    @Query('userId') userId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.auditService.findAll(tenantId, {
      eventType,
      userId,
      deviceId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('verify')
  @RequirePermissions('audit.read')
  async verifyChain(@CurrentUser('tenantId') tenantId: string) {
    return this.auditService.verifyChain(tenantId);
  }

  /**
   * Comprehensive audit chain verification with detailed reporting
   * POST /audit/verify-chain
   */
  @Post('verify-chain')
  @RequirePermissions('audit.read')
  async verifyAuditChain(@CurrentUser('tenantId') tenantId: string) {
    const result = await this.auditService.verifyAuditChain(tenantId);

    return {
      success: true,
      verification: result,
    };
  }

  /**
   * Get audit chain statistics
   * GET /audit/statistics
   */
  @Get('statistics')
  @RequirePermissions('audit.read')
  async getStatistics(@CurrentUser('tenantId') tenantId: string) {
    const stats = await this.auditService.getChainStatistics(tenantId);

    return {
      success: true,
      statistics: stats,
    };
  }
}
