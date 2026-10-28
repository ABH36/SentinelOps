# Windows Agent Installation Guide

## Quick Start

### Prerequisites
- Windows Server 2016+ or Windows 10+
- Administrator privileges
- Device enrollment credentials (DeviceKey and DeviceSecret)
- Network access to SentinelOps backend

### Basic Installation

```powershell
# Run as Administrator
cd scripts
.\install-windows-agent.ps1 -DeviceKey "your_device_key" -DeviceSecret "your_device_secret"
```

### Custom Installation

```powershell
# With custom backend URL
.\install-windows-agent.ps1 `
    -DeviceKey "your_device_key" `
    -DeviceSecret "your_device_secret" `
    -BackendUrl "https://staging.sentinelops.com"

# Without watchdog service
.\install-windows-agent.ps1 `
    -DeviceKey "your_device_key" `
    -DeviceSecret "your_device_secret" `
    -InstallWatchdog $false

# Custom installation path
.\install-windows-agent.ps1 `
    -DeviceKey "your_device_key" `
    -DeviceSecret "your_device_secret" `
    -AgentPath "C:\CustomPath\Agent"
```

---

## Installation Details

### What Gets Installed

1. **Main Agent Service**
   - Name: `WUAgentHelper`
   - Display: `Windows Update Agent Helper`
   - Path: `C:\ProgramData\Microsoft\Windows\DeviceCache\{GUID}\`
   - Auto-start: Yes
   - Recovery: Automatic restart on failure

2. **Watchdog Service** (if enabled)
   - Name: `WUAgentWatchdog`
   - Display: `Windows Update Agent Watchdog`
   - Monitors main agent health
   - Auto-restarts terminated agent

3. **Registry Keys**
   - Location: `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\DeviceSetup\{GUID}`
   - Keys: DeviceKey, DeviceSecret, BackendUrl
   - Protection: SYSTEM-only access, DPAPI encrypted

4. **File System**
   - Installation directory: Hidden + System attributes
   - NTFS ACLs: SYSTEM-only read/write/execute
   - Binaries: WUAgentHelper.exe, dependencies

### Security Features

✅ **Service DACL Hardening**
- Standard users: Cannot stop, delete, or modify service
- Administrators: Full control (for legitimate management)
- Interactive users: Read-only status queries

✅ **File System Protection**
- Hidden directory with GUID-based path
- SYSTEM-only file access (prevents tampering)
- Hidden + System attributes (invisible to standard users)

✅ **Registry Protection**
- SYSTEM-only access to configuration keys
- DPAPI encryption for sensitive values
- Keys disguised as Windows device setup data

✅ **Anti-Tamper Detection**
- Debugger detection on startup and runtime
- Parent process validation (must be services.exe)
- Automatic tamper event reporting to backend

---

## Verification

### Check Service Status

```powershell
# View service
Get-Service WUAgentHelper

# Check service is running
if ((Get-Service WUAgentHelper).Status -eq 'Running') {
    Write-Host "✓ Agent service is running" -ForegroundColor Green
} else {
    Write-Host "✗ Agent service is not running" -ForegroundColor Red
}

# View service details
Get-Service WUAgentHelper | Format-List *
```

### Check Service DACL

```powershell
# Display service security descriptor
sc.exe sdshow WUAgentHelper

# Expected output (DACL hardened):
# D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)
```

### Check Installation Path

```powershell
# Find installation directory (as Administrator)
Get-ChildItem "C:\ProgramData\Microsoft\Windows\DeviceCache" -Force -Recurse | 
    Where-Object { $_.Name -eq "WUAgentHelper.exe" } | 
    Select-Object FullName

# View directory attributes
$guid = "your_guid_here"  # Replace with actual GUID
(Get-Item "C:\ProgramData\Microsoft\Windows\DeviceCache\$guid" -Force).Attributes
# Expected: Hidden, System, Directory
```

### Check Registry Keys

```powershell
# List registry keys (as Administrator with SYSTEM context)
# Note: Standard administrators cannot read these without psexec -s
psexec -s -i powershell.exe
Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\DeviceSetup\*" | 
    Where-Object { $_.DeviceKey -ne $null }
```

### Check Backend Enrollment

```powershell
# View agent logs
Get-Content "C:\ProgramData\Microsoft\Windows\DeviceCache\{GUID}\logs\sentinelops-*.log" -Tail 50

# Look for enrollment confirmation:
# "Device enrolled with ID: <device_id>"
# "Heartbeat sent successfully"
```

---

## Troubleshooting

### Service Won't Start

**Symptom:** Service fails to start after installation

**Causes:**
1. Missing .NET 8.0 Runtime
2. Invalid device credentials
3. Network connectivity issues
4. Insufficient permissions

**Solutions:**
```powershell
# Check .NET Runtime
dotnet --version
# Install if missing: https://dotnet.microsoft.com/download/dotnet/8.0

# View service errors
Get-EventLog -LogName Application -Source "SentinelOps Agent" -Newest 10

# Check service can access backend
Test-NetConnection api.sentinelops.com -Port 443

# Restart service
Restart-Service WUAgentHelper
```

### Service Stops Unexpectedly

**Symptom:** Service stops and does not auto-restart

**Causes:**
1. Watchdog service not installed/running
2. Service recovery not configured
3. Critical error in agent code

**Solutions:**
```powershell
# Check watchdog service
Get-Service WUAgentWatchdog

# View service recovery configuration
sc.exe qfailure WUAgentHelper

# Manually restart service
Start-Service WUAgentHelper

# Re-run installation to fix configuration
.\install-windows-agent.ps1 -DeviceKey "key" -DeviceSecret "secret"
```

### "Access Denied" Errors

**Symptom:** Cannot access installation directory or registry keys

**Cause:** This is expected behavior for non-SYSTEM accounts

**Solutions:**
```powershell
# Run as SYSTEM using psexec (Sysinternals)
psexec -s -i powershell.exe

# Or run as SYSTEM using NTRIGHTS
ntrights -u SYSTEM +r SeDebugPrivilege
runas /user:SYSTEM powershell.exe
```

### Backend Not Receiving Heartbeats

**Symptom:** Device not showing in dashboard after 5+ minutes

**Causes:**
1. Network connectivity issues
2. Invalid device credentials
3. Backend URL misconfigured
4. Firewall blocking outbound HTTPS

**Solutions:**
```powershell
# Test backend connectivity
Test-NetConnection api.sentinelops.com -Port 443

# Check agent logs for errors
Get-Content "C:\ProgramData\Microsoft\Windows\DeviceCache\{GUID}\logs\sentinelops-*.log" -Tail 100 | 
    Select-String "error|fail|exception" -CaseSensitive:$false

# Verify credentials in registry (as SYSTEM)
psexec -s -i powershell.exe
$guid = Get-ChildItem "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\DeviceSetup" | 
    Where-Object { (Get-ItemProperty $_.PSPath).DeviceKey -ne $null } | 
    Select-Object -First 1 -ExpandProperty PSChildName
Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\DeviceSetup\$guid"

# Update credentials if needed
Stop-Service WUAgentHelper
.\install-windows-agent.ps1 -DeviceKey "new_key" -DeviceSecret "new_secret"
```

---

## Uninstallation

### Standard Uninstall (Administrator)

```powershell
# Stop services
Stop-Service WUAgentHelper -Force
Stop-Service WUAgentWatchdog -Force

# Delete services
sc.exe delete WUAgentHelper
sc.exe delete WUAgentWatchdog

# Remove installation directory
$guid = Get-ChildItem "C:\ProgramData\Microsoft\Windows\DeviceCache" -Force | 
    Where-Object { Test-Path "$($_.FullName)\WUAgentHelper.exe" } | 
    Select-Object -First 1 -ExpandProperty Name
Remove-Item "C:\ProgramData\Microsoft\Windows\DeviceCache\$guid" -Recurse -Force

# Remove registry keys (as SYSTEM)
psexec -s -i powershell.exe
$regGuid = Get-ChildItem "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\DeviceSetup" | 
    Where-Object { (Get-ItemProperty $_.PSPath).DeviceKey -ne $null } | 
    Select-Object -First 1 -ExpandProperty PSChildName
Remove-Item "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\DeviceSetup\$regGuid" -Recurse -Force
```

### Automated Uninstall Script

```powershell
# Save as uninstall-windows-agent.ps1
#Requires -RunAsAdministrator

$ErrorActionPreference = "SilentlyContinue"

Write-Host "Uninstalling SentinelOps Agent..." -ForegroundColor Yellow

# Stop services
sc.exe stop WUAgentHelper
sc.exe stop WUAgentWatchdog

# Delete services
sc.exe delete WUAgentHelper
sc.exe delete WUAgentWatchdog

# Remove installation directory
$installDir = Get-ChildItem "C:\ProgramData\Microsoft\Windows\DeviceCache" -Force | 
    Where-Object { Test-Path "$($_.FullName)\WUAgentHelper.exe" } | 
    Select-Object -First 1 -ExpandProperty FullName

if ($installDir) {
    Remove-Item $installDir -Recurse -Force
    Write-Host "✓ Removed installation directory: $installDir" -ForegroundColor Green
}

Write-Host "✓ Agent uninstalled successfully" -ForegroundColor Green
Write-Host "⚠ Note: Registry keys require SYSTEM access to remove" -ForegroundColor Yellow
```

---

## Security Considerations

### For Administrators

⚠️ **Administrator Override:** Local administrators can bypass all protections implemented in TASK-023. To fully secure the agent:

1. **Implement Code Signing:**
   - Sign agent binaries with trusted certificate
   - Enable Driver Signature Enforcement
   - Validate signatures before service starts

2. **Use Credential Guard:**
   - Enable Windows Credential Guard
   - Protects DPAPI master keys
   - Requires UEFI + TPM 2.0

3. **Network Segmentation:**
   - Restrict backend access to agent subnet
   - Use mutual TLS for authentication
   - Implement certificate pinning

4. **Monitoring:**
   - Enable security audit logging
   - Monitor service stop/delete events
   - Alert on registry key modifications
   - Track debugger attach events

### For Security Teams

✅ **This agent implements legitimate EDR/MDM capabilities:**
- Employee monitoring (with disclosure)
- Device management (corporate-owned devices)
- Security telemetry (threat detection)
- Remote administration (IT support)

⚠️ **Deployment Requirements:**
- Deploy only on corporate-owned devices
- Obtain user consent (where legally required)
- Maintain clear privacy policies
- Document in asset management

❌ **DO NOT use for:**
- Surveillance without consent
- Monitoring personal devices without authorization
- Unauthorized access to systems
- Any illegal purposes

### Compliance

**GDPR/CCPA Considerations:**
- Disclose monitoring to employees
- Provide data access mechanisms
- Implement data retention policies
- Allow consent withdrawal (where applicable)

**Industry Standards:**
- ISO 27001: Implement access controls
- SOC 2: Maintain audit logs
- NIST CSF: Document security controls
- PCI DSS: Encrypt sensitive data

---

## Support

### Logs

Agent logs are located at:
```
C:\ProgramData\Microsoft\Windows\DeviceCache\{GUID}\logs\sentinelops-YYYYMMDD.log
```

Event logs:
```
Event Viewer → Windows Logs → Application → Source: "SentinelOps Agent"
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Service won't start | Missing .NET 8.0 | Install .NET 8.0 Runtime |
| Access Denied | Non-SYSTEM account | Use psexec -s or run as SYSTEM |
| No heartbeats | Network blocked | Check firewall, test connectivity |
| Service stops | Debugger detected | Disable debugger, check anti-tamper logs |
| Registry not encrypted | DPAPI failure | Check DPAPI service, verify LocalMachine scope |

### Getting Help

1. Check agent logs for errors
2. Review Event Viewer for crash dumps
3. Verify network connectivity to backend
4. Test service DACL configuration
5. Contact support with logs and error messages

---

## Advanced Configuration

### Custom Service Name

To use a different service name (requires code changes):

1. Edit `scripts/install-windows-agent.ps1`
2. Change `$ServiceName` and `$ServiceDisplayName` variables
3. Rebuild agent with matching service name in code
4. Re-run installation script

### Certificate Pinning

Coming in TASK-025 (Certificate Pinning Implementation)

### Encrypted Telemetry

Coming in TASK-026 (Encrypted Telemetry Channel)

---

**Document Version:** 1.0  
**Last Updated:** 2026-10-27  
**Related Tasks:** TASK-023, TASK-021, TASK-022
