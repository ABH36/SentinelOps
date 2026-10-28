import { Controller, Post, Body, Get, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService, LoginDto, RegisterDto, MfaSetupDto } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Request() req: { ip?: string; headers?: { 'user-agent'?: string } },
  ) {
    return this.authService.login(
      loginDto,
      req.ip,
      req.headers?.['user-agent'],
    );
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/setup')
  async setupMfa(@CurrentUser('id') userId: string): Promise<MfaSetupDto> {
    return this.authService.setupMfa(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/enable')
  @HttpCode(HttpStatus.OK)
  async enableMfa(
    @CurrentUser('id') userId: string,
    @Body('code') code: string,
  ): Promise<void> {
    return this.authService.enableMfa(userId, code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  async disableMfa(
    @CurrentUser('id') userId: string,
    @Body('code') code: string,
  ): Promise<void> {
    return this.authService.disableMfa(userId, code);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getCurrentUser(@CurrentUser() user: any) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isMfaEnabled: user.isMfaEnabled,
      tenantId: user.tenantId,
      roles: user.roles,
    };
  }
}
