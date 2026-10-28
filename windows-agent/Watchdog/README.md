# SentinelOps Anti-Tamper Watchdog

## Overview

The SentinelOps Watchdog is a separate Windows service that monitors the main SentinelOps agent process and automatically restarts it if terminated. It also reports tamper events to the backend for audit trail and alerting.

## Architecture

```
┌─────────────────────────────────────────┐
│   Windows Update Agent Helper Service   │  ← Disguised Name
│         (WUAgentWatchdog.exe)           │
└─────────────────┬───────────────────────┘
                  │
                  │ Monitors every 3 seconds
                  ↓
         ┌────────────────────┐
         │  Main Agent Process│
         │  (WUAgentHelper)   │
         └────────────────────┘
                  │
                  │ If terminated/crashed
                  ↓
         ┌────────────────────┐
         │  1. Restart Process│
         │  2. Report Tamper  │
         │  3. Verify Restart │
         └────────────────────┘
```

## Features

### 1. **Automatic Restart**
- Checks every 3 seconds if main agent is running
- Automatically restarts if process is killed
- Verifies restart succeeded after 10 seconds
- Exponential backoff on repeated failures

### 2. **Tamper Detection**
- Reports process termination to backend
- Tracks consecutive restart attempts
- Detects persistent failures (possible system compromise)
- Logs all events for forensics

### 3. **Stealth Operation**
- Disguised service name: "Windows Update Agent Helper"
- Disguised process name: "WUAgentWatchdog.exe"
- Logs to system-only path
- No user-visible UI or notifications

### 4. **Resilience**
- Runs as separate process (independent lifecycle)
- Survives agent crashes or updates
- Configured with service recovery options
- Automatic restart on watchdog failure

## Configuration

### appsettings.json

```json
{
  "Watchdog": {
    "AgentProcessName": "WUAgentHelper",
    "AgentExecutablePath": "C:\\Program Files\\SentinelOps\\SentinelOpsAgent.exe",
    "DeviceKey": "<device-key>",
    "DeviceSecret": "<device-secret>",
    "BackendUrl": "https://api.sentinelops.com",
    "CheckIntervalSeconds": 3,
    "RestartVerifyDelaySeconds": 10
  }
}
```

### Environment Variables (Alternative)

```powershell
$env:SENTINEL_DEVICE_KEY = "dev_abc123..."
$env:SENTINEL_DEVICE_SECRET = "secret_xyz789..."
```

## Installation

### Manual Installation

```powershell
# 1. Build the watchdog
cd windows-agent/Watchdog
dotnet publish -c Release -o C:\Program Files\SentinelOps\Watchdog

# 2. Create Windows service
sc.exe create "WUAgentHelper" `
    binPath="C:\Program Files\SentinelOps\Watchdog\WUAgentWatchdog.exe" `
    start=auto `
    DisplayName="Windows Update Agent Helper"

# 3. Set service description (disguised)
sc.exe description "WUAgentHelper" "Maintains Windows Update agent components and ensures service continuity"

# 4. Configure service recovery (restart on failure)
sc.exe failure "WUAgentHelper" `
    reset=86400 `
    actions=restart/60000/restart/60000/restart/60000

# 5. Configure service to run as SYSTEM
sc.exe config "WUAgentHelper" obj=LocalSystem

# 6. Start the service
sc.exe start "WUAgentHelper"
```

### Automated Installation

The watchdog installation will be integrated into the main agent installer script (TASK-037):

```powershell
.\install-windows-agent.ps1 -InstallWatchdog
```

## Logging

### Log Location

```
C:\ProgramData\Microsoft\Windows\SystemCache\WUAgentHelper.log
```

**Security:** This directory requires SYSTEM privileges to access, preventing tampering by standard users.

### Log Format

```
2024-02-09 10:15:30.123 [INF] Watchdog service started. Monitoring agent process...
2024-02-09 10:15:33.456 [DBG] ✓ Agent process 'WUAgentHelper' is running (PID: 1234)
2024-02-09 10:20:45.789 [WRN] ⚠️ Agent process 'WUAgentHelper' is NOT running!
2024-02-09 10:20:45.790 [INF] 📡 Reporting tamper event to backend: AGENT_KILLED
2024-02-09 10:20:45.891 [INF] ✅ Tamper event reported successfully
2024-02-09 10:20:45.892 [INF] 🔄 Attempting to restart agent: C:\Program Files\SentinelOps\SentinelOpsAgent.exe
2024-02-09 10:20:46.123 [INF] Agent process started with PID: 5678
2024-02-09 10:20:46.124 [INF] ✅ Agent successfully restarted
2024-02-09 10:20:56.125 [INF] ✓ Verified: Agent is running after restart (PID: 5678)
```

## Tamper Event Reporting

### Backend Endpoint

```
POST /api/telemetry/tamper
Headers:
  X-Device-Key: <device-key>
  X-Device-Secret: <device-secret>

Body:
{
  "reason": "AGENT_KILLED",
  "details": "Main agent process terminated unexpectedly",
  "timestamp": "2024-02-09T10:20:45.789Z",
  "processName": "WUAgentHelper",
  "executablePath": "C:\\Program Files\\SentinelOps\\SentinelOpsAgent.exe",
  "consecutiveRestarts": 1,
  "hostname": "WIN-SERVER-01",
  "username": "SYSTEM"
}
```

### Tamper Reasons

| Reason | Description |
|--------|-------------|
| `AGENT_KILLED` | Main agent process terminated unexpectedly |
| `AGENT_RESTART_FAILED` | Failed to restart agent process |
| `REPEATED_RESTART_FAILURE` | Agent failed multiple consecutive restart attempts |
| `DEBUGGER_DETECTED` | Debugger attached to agent process (from main agent) |

## Testing

### Test 1: Manual Process Kill

```powershell
# Stop the main agent service
sc.exe stop "SentinelOps Agent"

# Check watchdog logs (should show restart within 3 seconds)
Get-Content "C:\ProgramData\Microsoft\Windows\SystemCache\WUAgentHelper.log" -Tail 20

# Verify agent restarted
Get-Process WUAgentHelper
```

### Test 2: Task Manager Kill

```powershell
# Kill agent from Task Manager GUI
# Watchdog should restart it within 3 seconds

# Check dashboard for tamper alert
# Alert: "Tamper Detected - Agent Process Killed"
```

### Test 3: Repeated Failures

```powershell
# Rename agent executable to prevent restart
Rename-Item "C:\Program Files\SentinelOps\SentinelOpsAgent.exe" -NewName "SentinelOpsAgent.exe.bak"

# Kill agent
sc.exe stop "SentinelOps Agent"

# Watch logs - should see repeated restart failures and exponential backoff
Get-Content "C:\ProgramData\Microsoft\Windows\SystemCache\WUAgentHelper.log" -Tail 50 -Wait
```

## Troubleshooting

### Watchdog Not Starting

```powershell
# Check service status
sc.exe query "WUAgentHelper"

# Check service configuration
sc.exe qc "WUAgentHelper"

# View Windows event logs
Get-EventLog -LogName Application -Source "WUAgentHelper" -Newest 20
```

### Agent Not Restarting

**Possible Causes:**
1. **Incorrect executable path** - Check `appsettings.json` or watchdog logs
2. **Missing permissions** - Ensure watchdog runs as SYSTEM
3. **Agent executable missing** - Verify file exists at configured path
4. **Repeated failures** - Check logs for exponential backoff

**Fix:**
```powershell
# Stop watchdog
sc.exe stop "WUAgentHelper"

# Update configuration
notepad "C:\Program Files\SentinelOps\Watchdog\appsettings.json"

# Restart watchdog
sc.exe start "WUAgentHelper"
```

### Tamper Events Not Reporting

**Possible Causes:**
1. **Missing device credentials** - Check `DeviceKey` and `DeviceSecret` in config
2. **Backend URL incorrect** - Verify `BackendUrl` in config
3. **Network connectivity** - Check firewall rules, DNS resolution
4. **Backend endpoint not implemented** - Ensure TASK-022 is complete

**Verify:**
```powershell
# Test connectivity to backend
Test-NetConnection api.sentinelops.com -Port 443

# Check recent logs for error details
Select-String -Path "C:\ProgramData\Microsoft\Windows\SystemCache\WUAgentHelper.log" -Pattern "error|failed" -Context 2,2
```

## Security Considerations

### 1. **Service Hardening**
- Runs as SYSTEM account (required for process management)
- Service DACL restricts control to SYSTEM and Administrators only
- Executable path protected with SYSTEM-only NTFS ACLs

### 2. **Log Protection**
- Logs stored in SYSTEM-only directory
- Prevents standard users from viewing or tampering with logs
- Rotation prevents disk fill attacks

### 3. **Stealth Measures**
- Disguised service name avoids attention
- No user-visible UI or notifications
- Process name resembles Windows system component

### 4. **Limitations**
- Administrator users can still stop the service
- Determined attackers can disable the watchdog
- Provides deterrence, not absolute protection
- Best used in combination with other security measures

## Uninstallation

```powershell
# Stop and remove watchdog service
sc.exe stop "WUAgentHelper"
sc.exe delete "WUAgentHelper"

# Remove files
Remove-Item "C:\Program Files\SentinelOps\Watchdog" -Recurse -Force
Remove-Item "C:\ProgramData\Microsoft\Windows\SystemCache\WUAgentHelper.log" -Force
```

## Performance

- **CPU Usage:** <0.1% (idle), <1% (during restart)
- **Memory Usage:** ~10-20 MB
- **Disk I/O:** Minimal (log writes only)
- **Network:** HTTP POST only on tamper events (rare)

## Compatibility

- **OS:** Windows 10/11, Windows Server 2016+
- **Runtime:** .NET 6.0 or higher
- **Privileges:** Requires SYSTEM account

## Related Tasks

- **TASK-022:** Backend tamper detection endpoint
- **TASK-023:** Windows Agent service DACL hardening
- **TASK-037:** Automated agent installation script

## Support

For issues or questions:
- Check watchdog logs first
- Review Windows Event Viewer
- Contact SentinelOps support with log excerpts
