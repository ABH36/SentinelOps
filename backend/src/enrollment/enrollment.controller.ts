import { Controller, Post, Get, Delete, Body, Param, UseGuards, Request, Query, Res, StreamableFile } from '@nestjs/common';
import { EnrollmentService, CreateEnrollmentTokenDto, EnrollmentRequestDto, GenerateInstallLinkDto } from './enrollment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@Controller('enrollment')
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Post('token')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('devices.enroll')
  async createToken(
    @Body() dto: CreateEnrollmentTokenDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') creatorId: string,
  ) {
    return this.enrollmentService.createToken(tenantId, creatorId, dto);
  }

  @Post('enroll')
  async enrollDevice(
    @Body() enrollmentRequest: EnrollmentRequestDto,
    @Request() req: { ip?: string },
  ) {
    // This endpoint is called by the agent without JWT auth
    // Tenant ID is extracted from the enrollment token
    return this.enrollmentService.enrollDevice(
      enrollmentRequest,
      '', // Tenant ID derived from token
      req.ip,
    );
  }

  @Delete('token/:token')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('devices.enroll')
  async revokeToken(
    @Param('token') token: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') revokerId: string,
  ) {
    return this.enrollmentService.revokeToken(token, tenantId, revokerId);
  }

  @Get('device/:deviceId')
  @UseGuards(JwtAuthGuard)
  async getActiveEnrollment(
    @Param('deviceId') deviceId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.enrollmentService.getActiveEnrollment(deviceId, tenantId);
  }

  @Get('android-qr/:tokenId')
  async getAndroidQrProvisioningData(@Param('tokenId') tokenId: string) {
    return this.enrollmentService.getAndroidDpcProvisioningJson(tokenId);
  }

  @Post('generate-install-link')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('devices.enroll')
  async generateInstallLink(
    @Body() dto: GenerateInstallLinkDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') creatorId: string,
  ) {
    return this.enrollmentService.generateInstallLink(tenantId, creatorId, dto);
  }

  @Get('tokens')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('devices.enroll')
  async getAllTokens(
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.enrollmentService.getAllEnrollmentTokens(tenantId);
  }
}

// Install endpoints (public, token-authenticated)
@Controller('install')
export class InstallController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Get('windows')
  async downloadWindowsInstaller(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    // Validate token
    await this.enrollmentService.validateToken(token);

    // Path to Windows installer (should be built and placed in dist/installers)
    const installerPath = path.join(process.cwd(), 'dist', 'installers', 'SentinelOpsAgent.msi');

    if (!fs.existsSync(installerPath)) {
      return res.status(404).json({ 
        error: 'Installer not found. Please build the Windows installer first.' 
      });
    }

    // Set headers for download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename=SentinelOpsAgent.msi');
    
    // Stream the file
    const fileStream = fs.createReadStream(installerPath);
    fileStream.pipe(res);
  }

  @Get('android')
  async downloadAndroidApk(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    // Validate token
    await this.enrollmentService.validateToken(token);

    // Path to Android APK (should be built and placed in dist/installers)
    const apkPath = path.join(process.cwd(), 'dist', 'installers', 'sentinelops-agent.apk');

    if (!fs.existsSync(apkPath)) {
      return res.status(404).json({ 
        error: 'APK not found. Please build the Android agent first.' 
      });
    }

    // Set headers for download
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename=sentinelops-agent.apk');
    
    // Stream the file
    const fileStream = fs.createReadStream(apkPath);
    fileStream.pipe(res);
  }

  @Get('windows-ps1')
  async downloadWindowsScript(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    // Validate token
    await this.enrollmentService.validateToken(token);

    const apiEndpoint = process.env.API_ENDPOINT || 'https://api.sentinelops.com';
    const baseUrl = apiEndpoint.replace('/api', '');

    // Generate PowerShell installation script
    const script = `
# SentinelOps Windows Agent - Auto Installer
# Enrollment Token: ${token}

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SentinelOps Agent Installation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Download installer
Write-Host "[1/4] Downloading installer..." -ForegroundColor Yellow
$installerUrl = "${baseUrl}/install/windows?token=${token}"
$installerPath = "$env:TEMP\\SentinelOpsAgent.msi"

try {
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
    Write-Host "✓ Download complete" -ForegroundColor Green
} catch {
    Write-Host "✗ Download failed: $_" -ForegroundColor Red
    exit 1
}

# Install agent
Write-Host "[2/4] Installing SentinelOps Agent..." -ForegroundColor Yellow
try {
    $msiArgs = "/i \`"$installerPath\`" /quiet /norestart API_URL=\`"${apiEndpoint}\`" ENROLLMENT_TOKEN=\`"${token}\`""
    Start-Process msiexec.exe -ArgumentList $msiArgs -Wait -NoNewWindow
    Write-Host "✓ Installation complete" -ForegroundColor Green
} catch {
    Write-Host "✗ Installation failed: $_" -ForegroundColor Red
    exit 1
}

# Verify service
Write-Host "[3/4] Verifying service status..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
$service = Get-Service -Name "SentinelOpsAgent" -ErrorAction SilentlyContinue
if ($service -and $service.Status -eq "Running") {
    Write-Host "✓ Service is running" -ForegroundColor Green
} else {
    Write-Host "⚠ Service not running yet (may take a few seconds)" -ForegroundColor Yellow
}

# Cleanup
Write-Host "[4/4] Cleaning up..." -ForegroundColor Yellow
Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue
Write-Host "✓ Cleanup complete" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "The SentinelOps Agent is now installed and enrolling..." -ForegroundColor Cyan
Write-Host "Check the SentinelOps dashboard for device enrollment status." -ForegroundColor Cyan
Write-Host ""
    `.trim();

    // Set headers for PowerShell script
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename=install-sentinelops.ps1');
    
    return res.send(script);
  }

  @Get()
  async universalInstall(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    // Validate token
    await this.enrollmentService.validateToken(token);

    const apiEndpoint = process.env.API_ENDPOINT || 'https://api.sentinelops.com';
    const baseUrl = apiEndpoint.replace('/api', '');

    // Universal landing page with platform detection
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SentinelOps Agent Installation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      padding: 40px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 {
      color: #1f2937;
      margin-bottom: 10px;
      font-size: 28px;
      text-align: center;
    }
    .subtitle {
      color: #6b7280;
      text-align: center;
      margin-bottom: 30px;
      font-size: 14px;
    }
    .platform-btn {
      display: block;
      width: 100%;
      padding: 16px;
      margin: 12px 0;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      background: #f9fafb;
      color: #1f2937;
      font-size: 16px;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .platform-btn:hover {
      background: #4f46e5;
      color: white;
      border-color: #4f46e5;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
    }
    .icon {
      font-size: 24px;
    }
    .info {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 12px;
      margin-top: 20px;
      border-radius: 4px;
      font-size: 13px;
      color: #92400e;
    }
    .detected {
      background: #d1fae5;
      color: #065f46;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      text-align: center;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🛡️ SentinelOps Agent</h1>
    <p class="subtitle">Select your platform to begin installation</p>
    
    <div id="detected" class="detected" style="display:none;">
      ✓ Detected: <strong id="platform-name"></strong>
    </div>

    <a href="${baseUrl}/install/windows?token=${token}" class="platform-btn">
      <span class="icon">🪟</span>
      <div>
        <div>Windows</div>
        <div style="font-size: 12px; font-weight: 400; color: #6b7280;">Download MSI Installer</div>
      </div>
    </a>

    <a href="${baseUrl}/install/android?token=${token}" class="platform-btn">
      <span class="icon">📱</span>
      <div>
        <div>Android</div>
        <div style="font-size: 12px; font-weight: 400; color: #6b7280;">Download APK</div>
      </div>
    </a>

    <div class="info">
      <strong>⚠️ Installation Instructions:</strong><br>
      • Windows: Run the downloaded MSI as Administrator<br>
      • Android: Enable "Unknown Sources" if prompted<br>
      • Enrollment happens automatically after installation
    </div>
  </div>

  <script>
    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    const detected = document.getElementById('detected');
    const platformName = document.getElementById('platform-name');
    
    if (userAgent.includes('android')) {
      detected.style.display = 'block';
      platformName.textContent = 'Android Device';
      // Auto-redirect to Android after 2 seconds
      setTimeout(() => {
        window.location.href = '${baseUrl}/install/android?token=${token}';
      }, 2000);
    } else if (userAgent.includes('windows') || userAgent.includes('win32') || userAgent.includes('win64')) {
      detected.style.display = 'block';
      platformName.textContent = 'Windows Device';
    }
  </script>
</body>
</html>
    `.trim();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }
}
