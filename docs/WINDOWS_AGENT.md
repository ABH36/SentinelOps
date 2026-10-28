# Windows Agent Installation Guide

## Prerequisites

- Windows 10 or Windows 11
- .NET Runtime 7.0 or later
- Administrator privileges for installation

## Installation Methods

### Method 1: Manual Installation

1. Download the latest MSI installer from the SentinelOps Enterprise portal
2. Run the installer as Administrator
3. Follow the installation wizard prompts
4. The agent will be installed as a Windows service named "SentinelOps Agent"

### Method 2: Command Line Installation

```cmd
msiexec /i SentinelOpsAgent.msi /quiet API_URL="http://your-server:3001/api"
```

### Method 3: GPO Deployment

1. Place the MSI installer in a network share accessible by all target computers
2. Create a Group Policy Object (GPO) with a software installation assignment
3. Link the GPO to the appropriate OU containing target computers
4. The agent will be automatically installed on next Group Policy refresh

### Method 4: SCCM Deployment

1. Upload the MSI installer to your SCCM application catalog
2. Create a deployment targeting the desired device collection
3. Deploy the application with appropriate deployment type settings
4. The agent will be installed on target machines according to deployment schedule

## Configuration

The agent configuration is stored in:

```
C:\Program Files\SentinelOps Agent\appsettings.json
```

### Configuration Options

```json
{
  "Agent": {
    "ApiUrl": "http://localhost:3001/api",
    "DeviceId": "",
    "DeviceKey": "",
    "DeviceSecret": "",
    "HeartbeatIntervalSeconds": 300,
    "InventoryIntervalSeconds": 3600,
    "IsEnrolled": false
  }
}
```

- `ApiUrl`: URL of the SentinelOps backend API
- `DeviceId`: Unique device identifier (auto-generated on enrollment)
- `DeviceKey`: Device authentication key (auto-generated on enrollment)
- `DeviceSecret`: Device authentication secret (auto-generated on enrollment)
- `HeartbeatIntervalSeconds`: How often to send heartbeat (default: 300 seconds)
- `InventoryIntervalSeconds`: How often to collect inventory (default: 3600 seconds)
- `IsEnrolled`: Whether the device is enrolled (true after successful enrollment)

## Device Enrollment

### Interactive Enrollment

1. After installation, open a command prompt as Administrator
2. Navigate to the agent installation directory:
   ```cmd
   cd "C:\Program Files\SentinelOps Agent"
   ```
3. Run the enrollment command:
   ```cmd
   SentinelOpsAgent.exe enroll --token YOUR_ENROLLMENT_TOKEN
   ```
4. Wait for enrollment confirmation
5. The service will automatically start after successful enrollment

### Automated Enrollment

For automated deployment, you can pass the enrollment token during installation:

```cmd
msiexec /i SentinelOpsAgent.msi /quiet API_URL="http://your-server:3001/api" ENROLLMENT_TOKEN="YOUR_TOKEN"
```

## Service Management

### Start Service
```cmd
net start "SentinelOps Agent"
```

### Stop Service
```cmd
net stop "SentinelOps Agent"
```

### Restart Service
```cmd
net stop "SentinelOps Agent"
net start "SentinelOps Agent"
```

### Check Service Status
```cmd
sc query "SentinelOps Agent"
```

## Logs

Agent logs are stored in:

```
C:\ProgramData\SentinelOps Agent\logs\
```

Log files are rotated daily and retained for 30 days by default.

### Viewing Logs

```cmd
type "C:\ProgramData\SentinelOps Agent\logs\sentinelops-20240101.log"
```

### Event Log

The agent also writes to the Windows Event Log under:
- **Log Name:** Application
- **Source:** SentinelOps Agent

View via Event Viewer:
```
Event Viewer > Windows Logs > Application
Filter by "SentinelOps Agent"
```

## Troubleshooting

### Service Won't Start

1. Check the Event Log for error messages
2. Verify .NET Runtime 7.0 is installed
3. Ensure the service account has sufficient permissions
4. Check that the API URL is accessible from the machine

### Enrollment Fails

1. Verify the enrollment token is valid and not expired
2. Check network connectivity to the API server
3. Ensure the API URL in configuration is correct
4. Review agent logs for detailed error messages

### Heartbeat Not Sending

1. Verify the device is enrolled (check `IsEnrolled` in config)
2. Check that device credentials are present in configuration
3. Verify network connectivity and firewall settings
4. Check agent logs for connection errors

### Permission Issues

The agent requires the following permissions:
- Read access to system information (WMI)
- Network access to communicate with API server
- Write access to log directory
- Service operation permissions

Run the service under the Local System account for full functionality.

## Uninstallation

### Manual Uninstallation

1. Stop the service:
   ```cmd
   net stop "SentinelOps Agent"
   ```
2. Uninstall via Programs and Features in Control Panel
3. Or run:
   ```cmd
   msiexec /x {Product-Code}
   ```

### Command Line Uninstallation

```cmd
msiexec /x SentinelOpsAgent.msi /quiet
```

### GPO/SCCM Removal

Follow your organization's standard software removal procedures.

## Security Considerations

- The agent communicates over HTTPS in production environments
- Device credentials are stored in the configuration file (protect appropriately)
- The agent runs as a Windows service with Local System privileges
- Logs may contain sensitive information (protect log directory)
- Keep the agent updated to the latest version for security patches

## Firewall Configuration

The agent requires outbound access to:
- TCP port 443 (HTTPS) or configured API port
- Allow connections to the SentinelOps API server

Example Windows Firewall rule:
```cmd
netsh advfirewall firewall add rule name="SentinelOps Agent" dir=out action=allow protocol=TCP localport=any remoteport=443
```

## Performance Impact

The agent is designed for minimal performance impact:
- CPU usage: < 1% during normal operation
- Memory usage: ~50-100 MB
- Network usage: ~1-5 KB per heartbeat
- Disk usage: ~10 MB for logs (rotated daily)

Heartbeat and inventory collection are configurable to balance real-time visibility with resource usage.
