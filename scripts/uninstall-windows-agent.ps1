#Requires -RunAsAdministrator

<#
.SYNOPSIS
    SentinelOps Windows Agent Uninstaller
    
.DESCRIPTION
    Completely removes the SentinelOps MDM/EDR agent from the system.
    Stops and deletes services, removes files, and cleans up registry keys.
    
.PARAMETER ServiceName
    Service name to uninstall (default: WUAgentHelper)
    
.PARAMETER AgentPath
    Custom installation path (if non-standard path was used)
    
.PARAMETER RemoveHidden
    Search for and remove hidden installations (default: true)
    
.EXAMPLE
    .\uninstall-windows-agent.ps1
    
.EXAMPLE
    .\uninstall-windows-agent.ps1 -ServiceName "CustomService"
    
.EXAMPLE
    .\uninstall-windows-agent.ps1 -AgentPath "C:\CustomPath\Agent"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$ServiceName = "WUAgentHelper",
    
    [Parameter(Mandatory=$false)]
    [string]$AgentPath = "",
    
    [Parameter(Mandatory=$false)]
    [bool]$RemoveHidden = $true
)

$ErrorActionPreference = "Continue"

$WatchdogServiceName = "WUAgentWatchdog"

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   SentinelOps Windows Agent Uninstaller" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check administrator privileges
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "❌ ERROR: This script must be run as Administrator" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Running as Administrator" -ForegroundColor Green
Write-Host ""

# Stop services
Write-Host "Stopping services..." -ForegroundColor Yellow

$mainService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($mainService) {
    try {
        Stop-Service -Name $ServiceName -Force -ErrorAction Stop
        Write-Host "✓ Stopped service: $ServiceName" -ForegroundColor Green
    } catch {
        Write-Host "⚠️ WARNING: Failed to stop service $ServiceName: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "ℹ Service $ServiceName not found" -ForegroundColor Gray
}

$watchdogService = Get-Service -Name $WatchdogServiceName -ErrorAction SilentlyContinue
if ($watchdogService) {
    try {
        Stop-Service -Name $WatchdogServiceName -Force -ErrorAction Stop
        Write-Host "✓ Stopped service: $WatchdogServiceName" -ForegroundColor Green
    } catch {
        Write-Host "⚠️ WARNING: Failed to stop service $WatchdogServiceName: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "ℹ Service $WatchdogServiceName not found" -ForegroundColor Gray
}

Start-Sleep -Seconds 2

# Delete services
Write-Host ""
Write-Host "Deleting services..." -ForegroundColor Yellow

if ($mainService) {
    try {
        sc.exe delete $ServiceName | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Deleted service: $ServiceName" -ForegroundColor Green
        } else {
            Write-Host "⚠️ WARNING: Failed to delete service $ServiceName (exit code: $LASTEXITCODE)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️ WARNING: Failed to delete service $ServiceName: $_" -ForegroundColor Yellow
    }
}

if ($watchdogService) {
    try {
        sc.exe delete $WatchdogServiceName | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Deleted service: $WatchdogServiceName" -ForegroundColor Green
        } else {
            Write-Host "⚠️ WARNING: Failed to delete service $WatchdogServiceName (exit code: $LASTEXITCODE)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️ WARNING: Failed to delete service $WatchdogServiceName: $_" -ForegroundColor Yellow
    }
}

# Remove installation files
Write-Host ""
Write-Host "Removing installation files..." -ForegroundColor Yellow

$pathsToRemove = @()

# Add specified path
if (-not [string]::IsNullOrEmpty($AgentPath) -and (Test-Path $AgentPath)) {
    $pathsToRemove += $AgentPath
}

# Search for hidden installations
if ($RemoveHidden) {
    $basePath = "C:\ProgramData\Microsoft\Windows\DeviceCache"
    if (Test-Path $basePath) {
        $hiddenDirs = Get-ChildItem -Path $basePath -Force -Directory -ErrorAction SilentlyContinue | 
            Where-Object { Test-Path (Join-Path $_.FullName "SentinelOpsAgent.exe") }
        
        foreach ($dir in $hiddenDirs) {
            $pathsToRemove += $dir.FullName
        }
    }
}

if ($pathsToRemove.Count -eq 0) {
    Write-Host "ℹ No installation directories found" -ForegroundColor Gray
} else {
    foreach ($path in $pathsToRemove) {
        try {
            Write-Host "Removing: $path" -ForegroundColor Yellow
            Remove-Item -Path $path -Recurse -Force -ErrorAction Stop
            Write-Host "✓ Removed installation directory" -ForegroundColor Green
        } catch {
            Write-Host "⚠️ WARNING: Failed to remove directory $path: $_" -ForegroundColor Yellow
        }
    }
}

# Remove registry keys
Write-Host ""
Write-Host "Removing registry keys..." -ForegroundColor Yellow

$registryBasePath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\DeviceSetup"
if (Test-Path $registryBasePath) {
    try {
        $registryKeys = Get-ChildItem -Path $registryBasePath -ErrorAction SilentlyContinue | 
            Where-Object { 
                $props = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue
                $props.PSObject.Properties.Name -contains "DeviceKey"
            }
        
        foreach ($key in $registryKeys) {
            try {
                Remove-Item -Path $key.PSPath -Recurse -Force -ErrorAction Stop
                Write-Host "✓ Removed registry key: $($key.PSChildName)" -ForegroundColor Green
            } catch {
                Write-Host "⚠️ WARNING: Failed to remove registry key: $_" -ForegroundColor Yellow
            }
        }
        
        if ($registryKeys.Count -eq 0) {
            Write-Host "ℹ No agent registry keys found" -ForegroundColor Gray
        }
    } catch {
        Write-Host "⚠️ WARNING: Failed to search registry: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "ℹ Registry base path not found" -ForegroundColor Gray
}

# Remove Event Log source
Write-Host ""
Write-Host "Removing Event Log source..." -ForegroundColor Yellow

$eventLogSource = "Windows Update Agent Helper"
try {
    if ([System.Diagnostics.EventLog]::SourceExists($eventLogSource)) {
        Remove-EventLog -Source $eventLogSource -ErrorAction Stop
        Write-Host "✓ Removed Event Log source" -ForegroundColor Green
    } else {
        Write-Host "ℹ Event Log source not found" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️ WARNING: Failed to remove Event Log source: $_" -ForegroundColor Yellow
}

# Summary
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   Uninstallation Complete" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$remainingServices = Get-Service -Name $ServiceName,$WatchdogServiceName -ErrorAction SilentlyContinue
if ($remainingServices.Count -gt 0) {
    Write-Host "⚠️ WARNING: Some services may still exist:" -ForegroundColor Yellow
    foreach ($svc in $remainingServices) {
        Write-Host "  - $($svc.Name) ($($svc.Status))" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Manual cleanup may be required:" -ForegroundColor Yellow
    Write-Host "  sc.exe delete $ServiceName" -ForegroundColor Gray
    Write-Host "  sc.exe delete $WatchdogServiceName" -ForegroundColor Gray
} else {
    Write-Host "✓ All services removed successfully" -ForegroundColor Green
}

if ($pathsToRemove.Count -gt 0) {
    $remainingPaths = $pathsToRemove | Where-Object { Test-Path $_ }
    if ($remainingPaths.Count -gt 0) {
        Write-Host ""
        Write-Host "⚠️ WARNING: Some files may still exist:" -ForegroundColor Yellow
        foreach ($path in $remainingPaths) {
            Write-Host "  - $path" -ForegroundColor Yellow
        }
    } else {
        Write-Host "✓ All files removed successfully" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Note: A system reboot may be required to complete uninstallation." -ForegroundColor Gray
Write-Host ""
