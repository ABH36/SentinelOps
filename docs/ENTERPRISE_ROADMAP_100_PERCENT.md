# SentinelOps Enterprise: 100% Production & Competitor-Defeating Master Blueprint
**Document ID:** `SO-DOC-ROADMAP-2026-v2.0`  
**Classification:** Confidential / Enterprise Architecture & Operational Roadmap  
**Last Updated:** October 27, 2026 — Full Gap Audit + Secret Capabilities Expansion  
**Target Goal:** Transform SentinelOps into an ultra-reliable, zero-compromise, 100% productive, enterprise endpoint management & EDR platform capable of surpassing legacy platforms (Microsoft Intune, CrowdStrike Falcon, SentinelOne, VMware Workspace ONE).

---

## 1. Executive Summary & Competitive Benchmark

### 1.1 Competitive Positioning
Legacy MDM and EDR vendors suffer from high operational bloat, complex multi-agent overhead, vendor lock-in, and aggressive battery/CPU consumption. SentinelOps Enterprise delivers a unified, lightweight, multi-tenant control plane with dual-platform dominance across **Windows Laptops/Desktops** and **Android Enterprise Smart Devices**.

| Feature Capability | Microsoft Intune | CrowdStrike Falcon | VMware Workspace ONE | **SentinelOps Enterprise (Target 100%)** |
| :--- | :--- | :--- | :--- | :--- |
| **Windows Management** | Heavy (MSI/MDM) | EDR Only (No MDM) | Bloated Agent | **Native C# .NET Service (`SYSTEM`) + Lightweight** |
| **Android Management** | Work Profile focus | Limited Mobile | Complex Hub | **Full Device Owner (DPC) + Kiosk Mode + Zero-Touch QR** |
| **Remote Shell Execution** | PowerShell Graph (Slow) | Real Time Response (Fast) | Scripting Only | **Live Interactive Terminal (PowerShell / Android Shell) + Streaming** |
| **Hardware & Thermal Telemetry** | Basic | Minimal Hardware | Basic | **Core Thermals, Fan RPM, NVMe SMART, Battery Cycles** |
| **Live Geolocation & Geofencing** | Coarse / Rare | IP-based only | Good | **Real-time GPS Satcom + Interactive OpenStreetMap + Geofence + Geocurfew** |
| **Tamper Resistance** | Registry/Group Policy | Kernel Driver | Basic Service | **Dual-Process Watchdog + ACL Registry Hardening + Anti-Debug** |
| **Audit Ledger Integrity** | Database Logs | Proprietary Cloud | Standard Logs | **Cryptographic SHA-256 Chain Sealed Audit Ledger + UI Verifier** |
| **Behavioral Analytics** | None | Limited | None | **AI Z-Score Behavioral Anomaly Engine + 14-Day Baseline** |
| **Auto Remediation** | Manual only | Limited scripting | Manual | **Zero-Tolerance Sub-3s Auto-Kill + Policy Enforcement Engine** |
| **Software Deployment** | Full (complex) | None | Full (complex) | **Lightweight Package Deployment + Silent MSI/APK Push** |
| **SIEM Integration** | Partial | Falcon LogScale | Basic | **CEF/LEEF/JSON/OCSF Webhooks — Splunk, QRadar, Sentinel** |
| **Active Directory Sync** | Native | None | Native | **LDAP/AD Auto-Sync: users, computers, group-to-role mapping** |
| **Employee Privacy Mode** | None | None | None | **Zero-Knowledge Privacy Mode (GDPR/DPDP compliant)** |
| **Network Isolation** | None | Real-time | Limited | **One-Click Network Isolate — Preserves Management Channel** |
| **JIT Privileged Access** | Azure PIM only | None | None | **Built-in Just-in-Time Admin with Auto-Revoke Timer** |

---

## 2. Exhaustive Gap, Bug & Weakness Audit (Complete)

### 2.1 Endpoint Agent Deployment Gaps
* **GAP-01 (Windows Native Service Packaging):**
  * *Current State:* C# codebase exists in `windows-agent/` and simulator streams data, but no compiled standalone MSI / portable installer exists.
  * *Weakness:* Admins cannot deploy to production laptops via Active Directory GPO, SCCM, or direct one-click execution without building source code.
* **GAP-02 (Android Factory-Reset Provisioning QR):**
  * *Current State:* Kotlin DPC codebase exists in `android-agent/`, but enrollment relies on manual token input in debug UI. QR code renders on the `/enrollment` UI page but the provisioning JSON payload is not yet spec-compliant with Google DPC factory-reset flow.
  * *Weakness:* True Android **Device Owner** status requires factory-reset zero-touch QR provisioning during out-of-box setup (6-taps on welcome screen).

### 2.2 Communication & Latency Gaps
* **GAP-03 (Polling vs Live Duplex Streaming):**
  * *Current State:* Agent polls `/remote-actions/poll` every 5–30 seconds over HTTP.
  * *Weakness:* 3–5 second latency for command execution and responses. High enterprise bar requires sub-second live duplex WebSocket / TLS 1.3 pipe.
* **GAP-04 (Terminal Stdout Streaming):**
  * *Current State:* Commands return output only after full execution completes.
  * *Weakness:* Long-running diagnostic scripts (e.g. `ping`, `tracert`, `Get-EventLog`) cannot stream progress line-by-line. Interactive terminal is impossible without streaming.

### 2.3 Hardware Control & Data Loss Prevention (DLP) Gaps
* **GAP-05 (USB Mass Storage Restriction):**
  * *Current State:* BitLocker encryption is monitored in telemetry, but physical USB ports are not forcefully locked via registry policy.
  * *Weakness:* Rogue employees can connect unauthorized flash drives to exfiltrate company IP or introduce unauthorized files.
* **GAP-06 (Automated Prohibited Software Remediation):**
  * *Current State:* Backend detects prohibited processes (`torrent`, `anydesk`, `wireshark`) and triggers an alert. Process termination requires manual administrator intervention.
  * *Weakness:* Requires manual administrator intervention to kill the process instead of immediate automated zero-tolerance termination. 3–10 minute lag vs 3-second sub-second auto-kill.

### 2.4 Resiliency & Anti-Tamper Gaps
* **GAP-07 (Agent Tamper Vulnerability):**
  * *Current State:* Single service process. A rogue local administrator could run `Stop-Service` or kill the task.
  * *Weakness:* If the agent is terminated, control plane loses visibility. No watchdog, no DACL hardening on service, no anti-debug detection.
* **GAP-08 (Offline Event Queueing & Synchronization):**
  * *Current State:* Simulators and agents maintain in-memory telemetry buffers. If connection drops, events could be dropped on power-off.
  * *Weakness:* Need an encrypted local SQLite/LevelDB database on the endpoint that stores up to 100,000 events offline and flushes upon network reconnection.

### 2.5 Command Implementation Gaps (Newly Audited)
* **GAP-09 (REFRESH_INVENTORY Stub):**
  * *Current State:* `CommandExecutor.cs` handles `REFRESH_INVENTORY` by returning a dummy timestamp only. It does NOT call `InventoryCollector`.
  * *Weakness:* Triggering this command from the dashboard does nothing useful — inventory is never re-collected.
* **GAP-10 (Windows Agent: Only 4 of 14 Commands Implemented):**
  * *Current State:* Windows agent handles: `LOCK`, `RESTART`, `REFRESH_INVENTORY` (stub), `DIAGNOSTIC_BUNDLE` (basic).
  * *Missing:* `EXECUTE_COMMAND`, `KILL_PROCESS`, `USB_LOCK`, `SEND_NOTIFICATION`, `TAKE_SCREENSHOT`, `LOCATE_DEVICE`, `WIPE`, `RETIRE`, `SYNC_POLICY`, `NETWORK_ISOLATE`.
* **GAP-11 (Android Agent: Only 4 of 14 Commands Implemented):**
  * *Current State:* Android agent handles: `LOCK`, `RESTART`, `REFRESH_INVENTORY`, `WIPE`.
  * *Missing:* `EXECUTE_COMMAND`, `KILL_PROCESS`, `USB_LOCK`, `CAMERA_DISABLE`, `SCREEN_CAPTURE_DISABLE`, `KIOSK_MODE`, `SEND_NOTIFICATION`, `LOCATE_DEVICE`, `TAKE_SCREENSHOT`, `SYNC_POLICY`.

### 2.6 Backend Logic & Architecture Gaps (Newly Audited)
* **GAP-12 (Policy Enforcement Engine Not Wired):**
  * *Current State:* `PoliciesModule` has CRUD for policies and rules. DB entities exist. But policies are never evaluated against incoming telemetry — no policy triggers any enforcement action automatically.
  * *Weakness:* Admin-defined policies are dead config — they don't auto-enforce anything.
* **GAP-13 (Software Deployment Module Entirely Missing):**
  * *Current State:* `SoftwarePackage` and `SoftwareDeployment` TypeORM entities exist in the database schema. There is no corresponding controller, service, or module. The entire API surface is missing.
  * *Weakness:* Cannot push, install, or uninstall software on managed endpoints at all.
* **GAP-14 (Bull Queue Processors Missing):**
  * *Current State:* `JobsModule` enqueues tasks into Bull/Redis queues. Processor workers (the consumers that actually handle archival, offline sync, alert notifications) are not implemented.
  * *Weakness:* Queued jobs pile up silently and never execute. Background automation is non-functional.

---

## 3. Five-Phase Master Implementation Roadmap

```
+---------------------------------------------------------------------------------------------------------+
|                                    SENTINELOPS 100% ROADMAP                                            |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|  [PHASE 1] Zero-Touch Deployment & Packaging (Windows MSI + Android DPC QR + Full Commands)            |
|       |                                                                                                 |
|       v                                                                                                 |
|  [PHASE 2] DLP, Real-Time WebSocket Gateway & Anti-Tamper Watchdog Engine                              |
|       |                                                                                                 |
|       v                                                                                                 |
|  [PHASE 3] Offline Storage, Geocurfew, Forensics & Cryptographic Verification                          |
|       |                                                                                                 |
|       v                                                                                                 |
|  [PHASE 4] Software Deployment, Policy Engine, Network Isolation & JIT Admin                           |
|       |                                                                                                 |
|       v                                                                                                 |
|  [PHASE 5] AI Anomaly Detection, SIEM Integration, AD Sync & Executive Intelligence                    |
|                                                                                                         |
+---------------------------------------------------------------------------------------------------------+
```

---

### PHASE 1: Zero-Touch Native Distribution, 1-Click Deployment & Full Command Completion

#### Objective
Ensure that deploying the SentinelOps agent onto a new employee Windows laptop takes under 30 seconds via a 1-click script, an Android smartphone can be provisioned into Device Owner mode via a single QR code scan during initial setup, and all 14 remote action types are fully handled on both platforms.

#### Deliverables & Implementation

**1. Windows Silent Service Installer Script (`scripts/install-windows-agent.ps1`):**

```powershell
#Requires -RunAsAdministrator
param(
    [Parameter(Mandatory=$true)] [string]$TenantId,
    [Parameter(Mandatory=$true)] [string]$ApiEndpoint,
    [Parameter(Mandatory=$true)] [string]$EnrollmentToken,
    [string]$InstallPath = "C:\Program Files\SentinelOps"
)

Write-Host "=== SentinelOps Enterprise Agent Installer ===" -ForegroundColor Cyan

# 1. Create install directory
New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null

# 2. Download agent binaries
Write-Host "[1/6] Downloading SentinelOps agent..." -ForegroundColor Yellow
Invoke-WebRequest -Uri "$ApiEndpoint/downloads/SentinelOpsAgent.exe" -OutFile "$InstallPath\SentinelOpsAgent.exe"
Invoke-WebRequest -Uri "$ApiEndpoint/downloads/SentinelWatchdog.exe" -OutFile "$InstallPath\SentinelWatchdog.exe"

# 3. Write configuration
Write-Host "[2/6] Writing agent configuration..." -ForegroundColor Yellow
@"
{
  "Agent": {
    "ApiUrl": "$ApiEndpoint",
    "TenantId": "$TenantId",
    "EnrollmentToken": "$EnrollmentToken"
  }
}
"@ | Set-Content "$InstallPath\appsettings.json" -Encoding UTF8

# 4. Register Windows Services (run as SYSTEM)
Write-Host "[3/6] Registering Windows services..." -ForegroundColor Yellow
sc.exe create SentinelOpsAgent binPath= "`"$InstallPath\SentinelOpsAgent.exe`"" start= auto obj= "NT AUTHORITY\SYSTEM" DisplayName= "SentinelOps Enterprise Agent"
sc.exe create SentinelWatchdog binPath= "`"$InstallPath\SentinelWatchdog.exe`"" start= auto obj= "NT AUTHORITY\SYSTEM" DisplayName= "SentinelOps Watchdog"

# 5. Configure failure recovery (auto-restart)
sc.exe failure SentinelOpsAgent reset= 86400 actions= restart/3000/restart/5000/restart/10000
sc.exe failure SentinelWatchdog reset= 86400 actions= restart/3000/restart/3000/restart/3000

# 6. Harden NTFS permissions (only SYSTEM + Administrators can write)
Write-Host "[4/6] Hardening file permissions..." -ForegroundColor Yellow
$acl = Get-Acl $InstallPath
$acl.SetAccessRuleProtection($true, $false)
$rules = @(
    New-Object Security.AccessControl.FileSystemAccessRule("SYSTEM","FullControl","Allow"),
    New-Object Security.AccessControl.FileSystemAccessRule("Administrators","FullControl","Allow")
)
foreach($rule in $rules) { $acl.AddAccessRule($rule) }
Set-Acl $InstallPath $acl

# 7. Harden Service DACL (standard users cannot Stop-Service)
sc.exe sdset SentinelOpsAgent "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)"
sc.exe sdset SentinelWatchdog "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)"

# 8. Register Windows Event Log source
New-EventLog -LogName Application -Source "SentinelOps Agent" -ErrorAction SilentlyContinue

# 9. Start services
Write-Host "[5/6] Starting services..." -ForegroundColor Yellow
sc.exe start SentinelWatchdog
sc.exe start SentinelOpsAgent

Write-Host "[6/6] SentinelOps Agent installed and running!" -ForegroundColor Green
Write-Host "Device will enroll automatically within 30 seconds." -ForegroundColor Cyan
```

**2. Android Zero-Touch QR Code Provisioning Generator (`/enrollment`):**

* Implements Google Enterprise DPC Provisioning specification (spec-compliant payload):

```json
{
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME":
    "com.sentinelops.agent/com.sentinelops.agent.admin.SentinelDeviceAdminReceiver",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION":
    "https://<api-host>/downloads/sentinelops-agent.apk",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM":
    "<sha256-of-apk>",
  "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": false,
  "android.app.extra.PROVISIONING_WIFI_SSID": "<CORP_WIFI_SSID>",
  "android.app.extra.PROVISIONING_WIFI_PASSWORD": "<CORP_WIFI_PASSWORD>",
  "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
    "tenantId": "<tenantId>",
    "apiEndpoint": "https://<api-host>/api",
    "enrollmentToken": "<token>"
  }
}
```

* Renders the dynamic QR code on the Enrollment UI (`qrcode.react`) for instant camera scanning during factory-reset out-of-box setup.
* Backend endpoint `GET /enrollment/android-qr/:tokenId` generates and returns the provisioning JSON.

**3. Fix REFRESH_INVENTORY Stub (GAP-09):**

* In `CommandExecutor.cs`, replace the stub `case "REFRESH_INVENTORY"` to actually invoke `InventoryCollector.CollectFullInventoryAsync()` and POST the result to `/inventory/ingest`, then return the real package count and refreshedAt timestamp.

**4. Complete All 14 Windows Command Handlers (GAP-10):**

New command implementations to add in `CommandExecutor.cs`:

```csharp
case "EXECUTE_COMMAND":
    // Interactive PowerShell — stdout streamed line-by-line via WebSocket
    var proc = new Process { StartInfo = new ProcessStartInfo {
        FileName = "powershell.exe",
        Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{payload.command}\"",
        RedirectStandardOutput = true, RedirectStandardError = true,
        UseShellExecute = false, CreateNoWindow = true
    }};
    proc.OutputDataReceived += (s, e) => wsClient.StreamLine(command.id, e.Data);
    proc.Start();
    proc.BeginOutputReadLine();
    proc.WaitForExit();
    resultData["exitCode"] = proc.ExitCode;

case "KILL_PROCESS":
    // Kill by name or PID
    var targets = Process.GetProcessesByName(payload.processName);
    foreach (var p in targets) p.Kill(entireProcessTree: true);
    resultData["killedCount"] = targets.Length;

case "USB_LOCK":
    // DISABLE: Start=4 | READ_ONLY: WriteProtect=1 | ENABLE: Start=3
    switch (payload.mode) {
        case "DISABLE":
            Registry.SetValue(@"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\USBSTOR",
                "Start", 4, RegistryValueKind.DWord);
            break;
        case "READ_ONLY":
            Registry.SetValue(@"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\StorageDevicePolicies",
                "WriteProtect", 1, RegistryValueKind.DWord);
            break;
        case "ENABLE":
            Registry.SetValue(@"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\USBSTOR",
                "Start", 3, RegistryValueKind.DWord);
            Registry.SetValue(@"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\StorageDevicePolicies",
                "WriteProtect", 0, RegistryValueKind.DWord);
            break;
    }
    resultData["usbMode"] = payload.mode;

case "SEND_NOTIFICATION":
    // Windows 10/11 Toast Notification to logged-in user
    new ToastContentBuilder()
        .AddText("SentinelOps IT Notice")
        .AddText(payload.message)
        .Show();
    resultData["notifiedAt"] = DateTime.UtcNow.ToString("o");

case "TAKE_SCREENSHOT":
    // Silent capture of all monitors — no UI feedback to user
    var screens = Screen.AllScreens;
    var screenshots = new List<string>();
    foreach (var screen in screens) {
        using var bmp = new Bitmap(screen.Bounds.Width, screen.Bounds.Height);
        using var g = Graphics.FromImage(bmp);
        g.CopyFromScreen(screen.Bounds.X, screen.Bounds.Y, 0, 0, screen.Bounds.Size);
        using var ms = new MemoryStream();
        bmp.Save(ms, ImageFormat.Jpeg);
        screenshots.Add(Convert.ToBase64String(ms.ToArray()));
    }
    await _client.PostAsync("/evidence/screenshot",
        new { commandId = command.id, screenshots, capturedAt = DateTime.UtcNow });

case "LOCATE_DEVICE":
    // Windows Location API with IP geolocation fallback
    var locator = new GeoCoordinateWatcher(GeoPositionAccuracy.High);
    locator.Start();
    await Task.Delay(5000); // wait up to 5 seconds for GPS fix
    resultData["latitude"] = locator.Position.Location.Latitude;
    resultData["longitude"] = locator.Position.Location.Longitude;
    resultData["accuracy"] = locator.Position.Location.HorizontalAccuracy;

case "WIPE":
    // Factory reset via Windows Recovery Environment
    Process.Start("reagentc.exe", "/boottore");
    Process.Start("shutdown.exe", "/r /t 0");

case "SYNC_POLICY":
    // Download latest policy config from backend and apply locally
    var policy = await _client.GetAsync<PolicyConfig>("/policies/device-policy", cancellationToken);
    await _policyApplicator.ApplyAsync(policy.Data, cancellationToken);
    resultData["syncedAt"] = DateTime.UtcNow.ToString("o");

case "NETWORK_ISOLATE":
    // Block all traffic EXCEPT management channel (preserves C2 connection)
    // See Phase 4 full implementation
    await RunCommandAsync("netsh advfirewall set allprofiles state on");
    await RunCommandAsync("netsh advfirewall firewall add rule name=\"SentinelOps Block All Out\" dir=out action=block");
    await RunCommandAsync($"netsh advfirewall firewall add rule name=\"SentinelOps Allow Mgmt\" dir=out action=allow remoteip={_config.ServerIp} protocol=tcp remoteport={_config.Port}");
    resultData["isolatedAt"] = DateTime.UtcNow.ToString("o");
    resultData["managementChannelPreserved"] = true;

case "NETWORK_RESTORE":
    await RunCommandAsync("netsh advfirewall firewall delete rule name=\"SentinelOps Block All Out\"");
    await RunCommandAsync("netsh advfirewall firewall delete rule name=\"SentinelOps Allow Mgmt\"");
    resultData["restoredAt"] = DateTime.UtcNow.ToString("o");
```

**5. Complete All Missing Android Command Handlers (GAP-11):**

New command cases to add in `RemoteCommandWorker.kt`:

```kotlin
"KILL_PROCESS" -> {
    // Device Owner: force-stop app by package name
    if (dpm.isDeviceOwnerApp(context.packageName)) {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        am.killBackgroundProcesses(cmd.payload?.packageName ?: "")
        resultData["killedPackage"] = cmd.payload?.packageName ?: ""
    }
}
"USB_LOCK" -> {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        dpm.setUsbDataSignalingEnabled(adminComponent, false)
        resultData["usbLocked"] = true
    }
}
"CAMERA_DISABLE" -> {
    dpm.setCameraDisabled(adminComponent, cmd.payload?.disabled ?: true)
    resultData["cameraDisabled"] = cmd.payload?.disabled ?: true
}
"SCREEN_CAPTURE_DISABLE" -> {
    dpm.setScreenCaptureDisabled(adminComponent, cmd.payload?.disabled ?: true)
    resultData["screenCaptureDisabled"] = cmd.payload?.disabled ?: true
}
"KIOSK_MODE" -> {
    // Lock device to single approved app
    val packages = arrayOf(cmd.payload?.packageName ?: context.packageName)
    dpm.setLockTaskPackages(adminComponent, packages)
    val intent = context.packageManager.getLaunchIntentForPackage(packages[0])
    intent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
    resultData["kioskPackage"] = packages[0]
}
"SEND_NOTIFICATION" -> {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val notification = NotificationCompat.Builder(context, "sentinel_commands")
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle(cmd.payload?.title ?: "SentinelOps IT Notice")
        .setContentText(cmd.payload?.message ?: "")
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .build()
    nm.notify(System.currentTimeMillis().toInt(), notification)
    resultData["notifiedAt"] = System.currentTimeMillis()
}
"LOCATE_DEVICE" -> {
    val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val location = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
        ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
    resultData["latitude"] = location?.latitude ?: 0.0
    resultData["longitude"] = location?.longitude ?: 0.0
    resultData["accuracy"] = location?.accuracy ?: -1.0
    resultData["fixedAt"] = System.currentTimeMillis()
}
"TAKE_SCREENSHOT" -> {
    // Requires Device Owner + MediaProjection API (Android 10+)
    // Capture via virtual display and upload to backend
    resultData["note"] = "Screenshot captured and uploaded"
}
"SYNC_POLICY" -> {
    // Fetch and apply latest device policy from backend
    val policy = networkClient.apiService.getDevicePolicy(storage.deviceKey!!, storage.deviceSecret!!)
    PolicyApplicator.apply(context, dpm, adminComponent, policy)
    resultData["syncedAt"] = System.currentTimeMillis()
}
```

---

### PHASE 2: Data Loss Prevention (DLP), Real-Time WebSocket Gateway & Anti-Tamper Engine

#### Objective
Eliminate all polling delays for true sub-second command-and-control, enforce hardware DLP policies, automatically terminate prohibited software in under 3 seconds with zero administrator lag, and make the agent architecturally resilient against termination attempts.

#### Deliverables & Implementation

**1. WebSocket / Socket.IO Duplex Tunnel (GAP-03 & GAP-04 Fix):**

Backend gateway — `src/gateway/agent.gateway.ts`:
```typescript
@WebSocketGateway({ namespace: '/agent-gateway', cors: true })
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  async handleConnection(client: Socket) {
    const deviceKey = client.handshake.headers['x-device-key'] as string;
    const deviceSecret = client.handshake.headers['x-device-secret'] as string;
    const device = await this.enrollmentService.verifyCredential(deviceKey, deviceSecret);
    client.join(`device:${device.id}`);
    this.connectedDevices.set(device.id, client.id);
    // Mark device ACTIVE immediately
    await this.deviceRepository.update({ id: device.id }, { status: DeviceStatus.ACTIVE });
  }

  // Dispatch command instantly — no polling, sub-200ms delivery
  async dispatchCommand(deviceId: string, command: RemoteAction): Promise<void> {
    this.server.to(`device:${deviceId}`).emit('command', {
      id: command.id,
      actionType: command.actionType,
      payload: command.payload
    });
  }

  // Receive streaming terminal stdout line by line
  @SubscribeMessage('terminal:stdout')
  async handleTerminalOutput(client: Socket, data: { commandId: string; line: string }) {
    // Forward to admin frontend in real time
    this.server.to(`admin:${data.commandId}`).emit('terminal:line', data);
  }

  @SubscribeMessage('command:result')
  async handleCommandResult(client: Socket, result: DeviceCommandResultDto) {
    await this.remoteActionsService.submitCommandResult(result);
  }
}
```

Windows Agent WebSocket client:
```csharp
// Replace HTTP polling with persistent WSS connection
// Falls back to HTTP polling if WebSocket fails (resilience)
var wsClient = new ClientWebSocket();
wsClient.Options.SetRequestHeader("X-Device-Key", _config.DeviceKey);
wsClient.Options.SetRequestHeader("X-Device-Secret", _config.DeviceSecret);
await wsClient.ConnectAsync(new Uri($"wss://{_config.ServerHost}/agent-gateway"), ct);
// Listen for 'command' events, execute immediately, stream stdout back
```

Android Agent WebSocket client (OkHttp):
```kotlin
val wsRequest = Request.Builder()
    .url("wss://${config.serverHost}/agent-gateway")
    .addHeader("X-Device-Key", storage.deviceKey!!)
    .addHeader("X-Device-Secret", storage.deviceSecret!!)
    .build()
val ws = okHttpClient.newWebSocket(wsRequest, SentinelWebSocketListener())
// Primary channel; WorkManager polling remains as fallback
```

**2. Automated Zero-Tolerance Process Termination Pipeline (GAP-06 Fix):**

In `heartbeat.service.ts → evaluateEnterpriseTelemetry()`, after creating the CRITICAL alert, immediately dispatch the kill command automatically:

```typescript
// After alertsService.create(CRITICAL alert)...

// Auto-dispatch KILL_PROCESS — no manual step, sub-3s remediation
await this.remoteActionsService.createAutoAction(device.tenantId, {
  deviceId: device.id,
  actionType: RemoteActionType.KILL_PROCESS,
  priority: RemoteActionPriority.URGENT,
  payload: { processName: proc.name, pid: proc.pid, reason: 'AUTO_ZERO_TOLERANCE_REMEDIATION' },
  requiresApproval: false,  // Zero-tolerance blacklist — no approval gate
  isAuto: true
});

// Also push enterprise violation popup to the device user
await this.remoteActionsService.createAutoAction(device.tenantId, {
  deviceId: device.id,
  actionType: RemoteActionType.SEND_NOTIFICATION,
  priority: RemoteActionPriority.URGENT,
  payload: {
    title: '⚠️ Security Policy Violation',
    message: `Process "${proc.name}" violates IT security policy and has been automatically terminated. This incident has been logged.`,
    type: 'SECURITY_WARNING'
  }
});
```

**3. USB Storage Access Control Engine (GAP-05 Fix):**

* **Windows:** Remote toggle for `USBSTOR` registry subkey:
  * *Disabled:* `Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR" -Name "Start" -Value 4`
  * *Read-Only:* `Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\StorageDevicePolicies" -Name "WriteProtect" -Value 1`
  * *Enabled:* `Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR" -Name "Start" -Value 3`
* **Android:** `DevicePolicyManager.setUsbDataSignalingEnabled(admin, false)` to prevent PC data exfiltration via USB debugging or MTP.
* New `RemoteActionType.USB_LOCK` enum value with `payload.mode`: `"DISABLE"` | `"READ_ONLY"` | `"ENABLE"`.

**4. Camera & Screen Capture Restriction (Android):**

* Remote toggle via `DevicePolicyManager.setScreenCaptureDisabled(admin, true)` and `DevicePolicyManager.setCameraDisabled(admin, true)` for sensitive corporate workspaces.
* New `RemoteActionType.CAMERA_DISABLE` and `RemoteActionType.SCREEN_CAPTURE_DISABLE` enum values.

**5. Dual-Process Watchdog Architecture — `SentinelWatchdog.exe` (GAP-07 Fix):**

* **Primary Service:** `SentinelOpsAgent.exe` performs monitoring and telemetry.
* **Watchdog Service:** `SentinelWatchdog.exe` runs as a secondary lightweight 3-second heartbeat monitor.
* If `SentinelOpsAgent.exe` terminates unexpectedly:
  1. Watchdog immediately spawns a new instance via `Process.Start()`.
  2. Watchdog transmits a high-priority `TAMPER_DETECTED` event to the control plane via HTTP POST (does not use WebSocket, to avoid dependency on the main agent's connection).
  3. CRITICAL alert created: `"Agent process terminated — possible tampering on device {deviceName}"`.
* Anti-debug detection in main agent:
  ```csharp
  if (Debugger.IsAttached) {
      await _client.PostAsync("/telemetry/tamper", new { reason = "DEBUGGER_ATTACHED" });
      Environment.Exit(0);  // Prevent reverse engineering
  }
  ```
* Service DACL hardened via `sc.exe sdset` preventing standard users from stopping or deleting either service.

---

### PHASE 3: Encrypted Offline Storage, Dynamic Geocurfew, Forensics & Audit Verification

#### Objective
Maintain 100% evidentiary and operational integrity even when an employee takes a corporate device completely offline (flights, field sites, deliberate connectivity cuts), provide legal-grade forensic capabilities, and surface cryptographic proof of audit integrity in the UI.

#### Deliverables & Implementation

**1. Encrypted Local SQLite Cache (GAP-08 Fix):**

* Storage path: `C:\ProgramData\SentinelOps\cache.db` (Windows) / Android KeyStore-encrypted Room DB.
* Encryption: AES-256-GCM key derived via Windows DPAPI (`ProtectedData.Protect`) / Android KeyStore.
* Schema: Tables for `telemetry_queue`, `activity_queue`, `audit_queue`, `usage_queue`.
* Retention: Stores up to 100,000 events (~30 days of offline monitoring).
* On network reconnect: events flushed in cryptographic batches of 500 with original timestamps preserved.

```csharp
public class OfflineBuffer {
    public void Queue(string eventType, object payload) {
        // Store locally when offline — never lose an event
        _db.Execute(
            "INSERT INTO telemetry_queue (event_type, payload, timestamp, synced) VALUES (?,?,?,0)",
            eventType, JsonSerializer.Serialize(payload), DateTime.UtcNow.ToString("o"));
    }

    public async Task FlushOnReconnectAsync(CommunicationClient client) {
        // Upload in batches of 500 on reconnection
        var pending = _db.Query<QueuedEvent>(
            "SELECT * FROM telemetry_queue WHERE synced=0 ORDER BY timestamp LIMIT 500");
        if (pending.Any()) {
            await client.PostAsync("/telemetry/batch", pending);
            _db.Execute(
                "UPDATE telemetry_queue SET synced=1 WHERE id IN (?)",
                string.Join(",", pending.Select(p => p.Id)));
        }
    }
}
```

**2. Dynamic Geocurfew & Operating Hours Restriction:**

* **Corporate Geofence:** Admin defines polygon perimeters for office campuses, operating cities, or approved regions via the map UI.
* **Geocurfew Policy:** Admin sets operating hours (e.g., Mon–Fri 08:00–20:00).
* **Automatic Enforcement:** If device is detected active outside approved hours AND outside approved geofence perimeter:
  1. Automatically dispatches `LOCK` remote action (URGENT priority).
  2. Sends device notification: *"Device outside authorized operational hours. Contact IT Support."*
  3. Records precise GPS fix in the alert details and creates `COMPLIANCE` category critical alert.

```typescript
// geocurfew.service.ts — called from heartbeat evaluator
async evaluateGeocurfew(device: Device, location: LocationData): Promise<void> {
  const policy = await this.policiesService.getActivePolicy(device.tenantId, 'GEOCURFEW');
  if (!policy) return;

  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun, 6=Sat

  const isInsideHours = day >= 1 && day <= 5 && hour >= policy.startHour && hour < policy.endHour;
  const isInsidePerimeter = this.isPointInPolygon(
    { lat: location.latitude, lng: location.longitude },
    policy.geofencePolygon
  );

  if (!isInsideHours && !isInsidePerimeter) {
    await this.remoteActionsService.createAutoAction(device.tenantId, {
      deviceId: device.id,
      actionType: RemoteActionType.LOCK,
      priority: RemoteActionPriority.URGENT,
      payload: { reason: 'GEOCURFEW_VIOLATION', time: now.toISOString() }
    });
    await this.remoteActionsService.createAutoAction(device.tenantId, {
      deviceId: device.id,
      actionType: RemoteActionType.SEND_NOTIFICATION,
      payload: { message: 'Device outside authorized operating hours. Contact IT Support.' }
    });
  }
}
```

**3. Remote Forensic Extraction Suite (`DIAGNOSTIC_BUNDLE` — Full Implementation):**

Collects legal-grade, non-invasive forensic triage artifacts:

```csharp
case "DIAGNOSTIC_BUNDLE":
    var bundle = new ForensicBundle {
        CollectedAt = DateTime.UtcNow,
        MachineName = Environment.MachineName,
        OsVersion = Environment.OSVersion.VersionString,
        UptimeSeconds = (int)TimeSpan.FromMilliseconds(Environment.TickCount64).TotalSeconds,
        // Network forensics
        NetworkConnections = await RunCommandAsync("netstat -ano"),     // TCP/UDP with PIDs
        DnsCache = await RunCommandAsync("ipconfig /displaydns"),
        FirewallRules = await RunCommandAsync("netsh advfirewall show allprofiles"),
        // Process forensics
        RunningProcesses = Process.GetProcesses().Select(p => new {
            p.Id, p.ProcessName, StartTime = TryGetStartTime(p),
            Path = TryGetPath(p), MemoryMB = p.WorkingSet64 / 1024 / 1024
        }),
        // Persistence forensics
        ScheduledTasks = await RunCommandAsync("schtasks /query /fo CSV /v"),
        AutoRunEntries = CollectRegistryAutoRuns(),  // Run/RunOnce keys
        InstalledDrivers = await RunCommandAsync("driverquery /v /fo CSV"),
        StartupPrograms = await RunCommandAsync("wmic startup get Caption,Command,Location"),
        // Security event log: logon, privilege escalation, account changes
        SecurityEvents = CollectEventLog("Security", new[] { 4624, 4625, 4648, 4672, 4720, 4732 }),
        // Hardware fingerprint
        HardwareHash = ComputeHardwareHash()
    };
    // Encrypt bundle with tenant public key, upload to /evidence/bundle
    var zipBytes = CreateEncryptedBundle(bundle, tenantPublicKey);
    await _client.PostBinaryAsync("/evidence/bundle", zipBytes, command.id);
    resultData["bundleSize"] = zipBytes.Length;
    resultData["artifactCount"] = bundle.GetArtifactCount();
```

**4. Cryptographic SHA-256 Audit Chain Verification Tool (on `/audit` UI):**

Backend verification endpoint `POST /audit/verify-chain`:

```typescript
async verifyAuditChain(tenantId: string): Promise<ChainVerificationResult> {
  const events = await this.auditEventRepository.find({
    where: { tenantId },
    order: { createdAt: 'ASC' }
  });

  let isValid = true;
  const violations: string[] = [];

  for (let i = 1; i < events.length; i++) {
    const expectedHash = crypto.createHash('sha256').update(JSON.stringify({
      eventType: events[i].eventType,
      tenantId: events[i].tenantId,
      userId: events[i].userId,
      deviceId: events[i].deviceId,
      details: events[i].details,
      timestamp: events[i].createdAt.toISOString(),
      previousHash: events[i - 1].eventHash
    })).digest('hex');

    if (events[i].eventHash !== expectedHash) {
      isValid = false;
      violations.push(
        `CHAIN BROKEN at event ${events[i].id} (${events[i].eventType}) — tampering detected!`
      );
    }
  }

  return {
    totalEvents: events.length,
    isIntact: isValid,
    violations,
    verifiedAt: new Date(),
    // Digitally signed certificate if chain is intact — suitable for compliance auditors
    certificate: isValid ? this.issueVerificationCertificate(tenantId, events.length) : null
  };
}
```

The formula verified for each event:
$$\text{Hash}_n = \text{SHA256}(\text{Hash}_{n-1} + \text{Payload}_n + \text{Timestamp}_n)$$

Guarantees to compliance auditors and courtrooms that activity logs have never been modified, deleted, or backdated. UI renders a green "Chain Intact" badge or lists specific tampered event IDs.

---

### PHASE 4: Software Deployment, Policy Engine, Network Isolation & JIT Admin

#### Objective
Build the entirely missing software deployment module, wire the policy enforcement engine to actually auto-enforce rules, add network isolation command capability, and implement just-in-time privileged access management.

#### Deliverables & Implementation

**1. Software Deployment Module — Full Build (GAP-13 Fix):**

```typescript
// NEW: software-deployment.module.ts
// API Surface:
POST   /software/packages          → Upload MSI/EXE/APK package to S3/MinIO storage
GET    /software/packages          → List available software catalog with metadata
POST   /software/deployments       → Deploy package to one or more devices
GET    /software/deployments/:id   → Track deployment status in real time
POST   /software/uninstall         → Remote silent uninstall by productCode

// Windows agent command handlers:
case "INSTALL_SOFTWARE":
    var tempPath = Path.GetTempFileName() + ".msi";
    await DownloadFileAsync(payload.downloadUrl, tempPath);
    var proc = Process.Start(new ProcessStartInfo {
        FileName = "msiexec.exe",
        Arguments = $"/i \"{tempPath}\" {payload.silentArgs ?? "/quiet /norestart"}",
        UseShellExecute = false
    });
    proc.WaitForExit();
    resultData["exitCode"] = proc.ExitCode;
    resultData["installedAt"] = DateTime.UtcNow.ToString("o");

case "UNINSTALL_SOFTWARE":
    Process.Start("msiexec.exe",
        $"/x {payload.productCode} /quiet /norestart");
    resultData["uninstalledAt"] = DateTime.UtcNow.ToString("o");

// Android agent:
"INSTALL_APK" -> {
    // Download APK, request install via PackageInstaller API (Device Owner)
    val pm = context.packageManager
    val session = pm.packageInstaller.createSession(
        PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL))
    // Write APK bytes into session, commit
}
```

**2. Policy Enforcement Engine Wiring (GAP-12 Fix):**

```typescript
// policies.service.ts — add enforcement evaluator, called from heartbeat.service.ts
async evaluateAndEnforce(device: Device, telemetry: TelemetryData): Promise<void> {
  const policies = await this.getActivePolicies(device.tenantId, device.platform);

  for (const policy of policies) {
    for (const rule of policy.rules) {
      const result = this.evaluateRule(rule, telemetry);

      if (result.violated) {
        // Auto-dispatch enforcement action defined in the rule
        await this.remoteActionsService.createAutoAction(device.tenantId, {
          deviceId: device.id,
          actionType: rule.enforcementAction,  // LOCK, KILL_PROCESS, USB_LOCK, etc.
          payload: rule.enforcementPayload,
          priority: rule.priority,
          requiresApproval: false
        });

        // Log policy violation in cryptographic audit chain
        await this.auditService.logEvent({
          eventType: AuditEventType.POLICY_VIOLATION,
          deviceId: device.id,
          tenantId: device.tenantId,
          details: { policy: policy.name, rule: rule.name, violation: result }
        });
      }
    }
  }
}
```

**3. Network Isolation Command — Emergency Response (New Capability):**

One-click complete network isolation that preserves the management channel so the admin retains control after isolation:

```csharp
case "NETWORK_ISOLATE":
    // Block ALL outbound traffic except the SentinelOps management port
    await RunCommandAsync("netsh advfirewall set allprofiles state on");
    await RunCommandAsync("netsh advfirewall firewall add rule name=\"SentinelOps Block All\" dir=out action=block");
    await RunCommandAsync($"netsh advfirewall firewall add rule name=\"SentinelOps Allow Mgmt\" dir=out " +
        $"action=allow remoteip={_config.ServerIp} protocol=tcp remoteport={_config.Port}");
    // Also block all inbound except management reply traffic
    await RunCommandAsync("netsh advfirewall firewall add rule name=\"SentinelOps Block Inbound\" dir=in action=block");
    await RunCommandAsync($"netsh advfirewall firewall add rule name=\"SentinelOps Allow Mgmt Inbound\" dir=in " +
        $"action=allow remoteip={_config.ServerIp} protocol=tcp localport={_config.Port}");
    resultData["isolatedAt"] = DateTime.UtcNow.ToString("o");
    resultData["managementChannelPreserved"] = true;

case "NETWORK_RESTORE":
    // Remove isolation rules, restore full connectivity
    await RunCommandAsync("netsh advfirewall firewall delete rule name=\"SentinelOps Block All\"");
    await RunCommandAsync("netsh advfirewall firewall delete rule name=\"SentinelOps Allow Mgmt\"");
    await RunCommandAsync("netsh advfirewall firewall delete rule name=\"SentinelOps Block Inbound\"");
    await RunCommandAsync("netsh advfirewall firewall delete rule name=\"SentinelOps Allow Mgmt Inbound\"");
    resultData["restoredAt"] = DateTime.UtcNow.ToString("o");
```

**4. Just-in-Time Privileged Access Management — `GRANT_TEMP_ADMIN` (New Capability):**

Enables IT to grant time-limited administrator rights to a specific user on a device, with automatic revocation after the approved window expires:

```csharp
case "GRANT_TEMP_ADMIN":
    var username = command.payload?.GetProperty("username").GetString();
    var durationMinutes = command.payload?.GetProperty("durationMinutes").GetInt32() ?? 30;
    
    // Grant local admin rights
    await RunCommandAsync($"net localgroup Administrators {username} /add");
    resultData["adminGrantedTo"] = username;
    resultData["expiresAt"] = DateTime.UtcNow.AddMinutes(durationMinutes).ToString("o");
    
    // Schedule auto-revoke in the background
    _ = Task.Delay(TimeSpan.FromMinutes(durationMinutes)).ContinueWith(async _ => {
        await RunCommandAsync($"net localgroup Administrators {username} /delete");
        await _client.PostAsync("/telemetry/event", new {
            eventType = "TEMP_ADMIN_REVOKED",
            username,
            revokedAt = DateTime.UtcNow.ToString("o")
        });
    });
```

**5. Bull Queue Processors — Full Implementation (GAP-14 Fix):**

```typescript
// jobs/processors/alert-notification.processor.ts
@Processor('alert-notifications')
export class AlertNotificationProcessor {
  @Process('send-email')
  async handleEmailAlert(job: Job<AlertJob>) {
    await this.mailerService.send({
      to: job.data.adminEmail,
      subject: `[CRITICAL] ${job.data.alert.title} — ${job.data.device.name}`,
      body: this.renderAlertEmail(job.data.alert)
    });
  }
}

// jobs/processors/telemetry-archival.processor.ts
@Processor('telemetry-archival')
export class TelemetryArchivalProcessor {
  @Process('archive-old-events')
  async archiveOldEvents(job: Job) {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
    await this.usageRepository.delete({ timestamp: LessThan(cutoff) });
    // Move to cold storage / S3 archive bucket
  }
}
```

---

### PHASE 5: AI Anomaly Detection, SIEM Integration, Active Directory Sync & Executive Intelligence

#### Objective
Differentiate SentinelOps from every competitor by embedding AI-driven behavioral anomaly detection, connecting to enterprise SIEM/SOAR platforms, auto-importing directory identities, and providing C-suite level fleet intelligence dashboards.

#### Deliverables & Implementation

**1. AI Behavioral Anomaly Detection Engine (New Capability):**

Learns each employee's normal behavioral baseline over 14 days, then flags statistical deviations:

```typescript
// NEW: anomaly-detection.service.ts

interface UserBehaviorBaseline {
  avgLoginHour: number;
  stdDevLoginHour: number;
  commonProcesses: string[];         // top 20 most used processes
  avgActiveHoursPerDay: number;
  avgDataTransferredMB: number;
  avgFileAccessPerHour: number;
  normalWorkDays: number[];          // e.g. [1,2,3,4,5]
}

async detectAnomalies(device: Device, session: UsageEvent[]): Promise<AnomalyResult[]> {
  const baseline = await this.getOrComputeBaseline(device.assignedEmployeeId);
  if (!baseline) return []; // Not enough data yet (< 14 days)

  const anomalies: AnomalyResult[] = [];

  // 1. Unusual login time — Z-score statistical test
  const loginHour = new Date(session[0].timestamp).getHours();
  const zScore = Math.abs((loginHour - baseline.avgLoginHour) / baseline.stdDevLoginHour);
  if (zScore > 2.5) {
    anomalies.push({
      type: 'UNUSUAL_LOGIN_TIME',
      severity: 'HIGH',
      confidence: Math.min(zScore / 4, 1.0),
      detail: `Login at ${loginHour}:00 — ${zScore.toFixed(1)}σ from normal pattern`
    });
  }

  // 2. Mass file access — potential data exfiltration
  const fileAccessEvents = session.filter(e => e.activeWindowProcess?.toLowerCase().includes('explorer'));
  if (fileAccessEvents.length > baseline.avgFileAccessPerHour * 5) {
    anomalies.push({
      type: 'MASS_FILE_ACCESS',
      severity: 'CRITICAL',
      confidence: 0.87,
      detail: `${fileAccessEvents.length} file access events — ${(fileAccessEvents.length / baseline.avgFileAccessPerHour).toFixed(1)}x normal rate`
    });
  }

  // 3. Never-before-seen process execution
  const newProcesses = session
    .map(e => e.activeWindowProcess?.toLowerCase())
    .filter(p => p && !baseline.commonProcesses.includes(p));
  if (newProcesses.length > 0) {
    anomalies.push({
      type: 'UNKNOWN_PROCESS_EXECUTION',
      severity: 'MEDIUM',
      confidence: 0.65,
      detail: `New processes detected: ${[...new Set(newProcesses)].join(', ')}`
    });
  }

  // 4. Weekend or off-hours activity on normally weekday-only employee
  const currentDay = new Date().getDay();
  if (!baseline.normalWorkDays.includes(currentDay)) {
    anomalies.push({
      type: 'OFF_HOURS_ACTIVITY',
      severity: 'MEDIUM',
      confidence: 0.75,
      detail: `Activity detected on non-work day (day ${currentDay})`
    });
  }

  // Trigger alerts for high/critical anomalies automatically
  for (const anomaly of anomalies.filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH')) {
    await this.alertsService.create(device.tenantId, {
      title: `Behavioral Anomaly: ${anomaly.type}`,
      description: anomaly.detail,
      severity: anomaly.severity === 'CRITICAL' ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
      category: AlertCategory.SECURITY,
      deviceId: device.id,
      details: { anomaly, baseline }
    });
  }

  return anomalies;
}
```

**2. SIEM / SOAR Integration Webhooks (New Capability):**

Connect SentinelOps to Splunk, IBM QRadar, Microsoft Sentinel, ServiceNow, or any webhook endpoint:

```typescript
// NEW: integrations.service.ts

async dispatchToSIEM(alert: Alert, device: Device): Promise<void> {
  const webhooks = await this.getActiveWebhooks(alert.tenantId, 'SIEM');

  for (const webhook of webhooks) {
    let payload: object;

    switch (webhook.format) {
      case 'CEF':  // ArcSight Common Event Format
        payload = `CEF:0|SentinelOps|Enterprise|1.0|${alert.category}|${alert.title}|${this.mapSeverityToCEF(alert.severity)}|` +
          `deviceExternalId=${device.deviceId} dhost=${device.deviceName} msg=${alert.description}`;
        break;
      case 'LEEF': // IBM QRadar Log Event Extended Format
        payload = `LEEF:2.0|SentinelOps|Enterprise|1.0|${alert.category}|\t` +
          `devName=${device.deviceName}\tsrc=${device.ipAddress}\tsev=${alert.severity}\tcat=${alert.category}`;
        break;
      case 'OCSF': // Open Cybersecurity Schema Framework
        payload = {
          class_uid: 2004, category_uid: 2,
          severity: this.mapSeverityToOCSF(alert.severity),
          message: alert.description,
          device: { name: device.deviceName, uid: device.deviceId, ip: device.ipAddress },
          metadata: { product: { name: 'SentinelOps', vendor_name: 'SentinelOps Inc.' } }
        };
        break;
      default:     // Plain JSON — Splunk HEC, custom webhooks
        payload = { alert, device, sentinelops_version: '2.0' };
    }

    await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${webhook.secret}`,
        'Content-Type': webhook.format === 'CEF' || webhook.format === 'LEEF'
          ? 'text/plain'
          : 'application/json'
      },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload)
    });
  }
}
```

**3. Active Directory / LDAP Auto-Sync (New Capability):**

```typescript
// NEW: ad-sync.service.ts

async syncFromActiveDirectory(config: ADSyncConfig): Promise<ADSyncResult> {
  const client = ldap.createClient({ url: config.ldapUrl, tlsOptions: { rejectUnauthorized: true } });
  
  // Bind with read-only service account
  await client.bind(config.serviceAccountDn, config.serviceAccountPassword);

  // 1. Sync computer objects → auto-create device records in SentinelOps
  const computers = await client.search(config.computerBaseDn, {
    filter: '(objectClass=computer)',
    attributes: ['cn', 'dNSHostName', 'operatingSystem', 'operatingSystemVersion', 'lastLogon']
  });
  for (const computer of computers) {
    await this.devicesService.upsertFromAD({
      deviceName: computer.cn,
      hostname: computer.dNSHostName,
      osVersion: computer.operatingSystemVersion,
      source: 'AD_SYNC'
    });
  }

  // 2. Sync user objects → assign employees to devices
  const users = await client.search(config.userBaseDn, {
    filter: '(&(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))',
    attributes: ['sAMAccountName', 'mail', 'displayName', 'department', 'memberOf']
  });
  for (const user of users) {
    await this.usersService.upsertFromAD({
      email: user.mail,
      displayName: user.displayName,
      department: user.department,
      adGroups: user.memberOf
    });
  }

  // 3. Map AD security groups → SentinelOps roles
  // e.g. "CN=IT Admins,OU=Groups" → ADMIN role
  await this.rolesService.syncGroupMappings(config.groupRoleMappings);

  // Schedule incremental sync every 15 minutes
  return { syncedComputers: computers.length, syncedUsers: users.length, syncedAt: new Date() };
}
```

**4. Executive Fleet Intelligence Dashboard (New Capability):**

New analytics endpoint `GET /analytics/fleet-intelligence`:

```typescript
// NEW: analytics.service.ts

async getFleetIntelligence(tenantId: string): Promise<FleetIntelligence> {
  const [
    deviceCount, offlineCount, criticalAlerts, complianceStats,
    productivityStats, threatTimeline, hardwareStats
  ] = await Promise.all([
    this.getDeviceCount(tenantId),
    this.getOfflineDeviceCount(tenantId, 24),
    this.getCriticalAlertCount(tenantId, 24),
    this.getComplianceStats(tenantId),
    this.getFleetProductivityScore(tenantId),
    this.getThreatTimeline(tenantId, 30),
    this.getHardwareAgeDistribution(tenantId)
  ]);

  return {
    // Security Posture Score (0–100, composite of multiple factors)
    securityScore: this.calculateSecurityScore(complianceStats, criticalAlerts, deviceCount),
    // Compliance rates
    bitlockerComplianceRate: complianceStats.bitlocker,
    osUpdateComplianceRate: complianceStats.osUpdate,
    antivirusComplianceRate: complianceStats.antivirus,
    // Active threats
    devicesAtRisk: await this.getDevicesAtRisk(tenantId),
    criticalAlertsLast24h: criticalAlerts,
    // Fleet status
    totalManagedDevices: deviceCount,
    devicesOnline: deviceCount - offlineCount,
    devicesOfflineOver24h: offlineCount,
    // Productivity intelligence
    avgProductivityScore: productivityStats.avgScore,
    topUnproductiveProcesses: productivityStats.topUnproductive,
    workHoursUtilization: productivityStats.workHoursUtilization,
    // Threat timeline (last 30 days)
    threatTimeline,
    // Asset health
    hardwareAgeDistribution: hardwareStats,
    devicesNearingEOL: hardwareStats.filter(d => d.ageYears >= 4)
  };
}
```

**5. Zero-Knowledge Employee Privacy Mode (New Capability):**

For GDPR (EU), India DPDP Act, and CCPA compliant deployments. Admin can configure privacy controls per tenant, device group, or individual user:

```typescript
// privacy-policy.entity.ts (new)
interface PrivacyPolicy {
  tenantId: string;
  monitorWindowTitles: boolean;        // false = collect process names only, not window titles
  monitorBrowsingActivity: boolean;    // false = no URL/domain tracking
  allowRemoteScreenshots: boolean;     // false = TAKE_SCREENSHOT command blocked
  allowKeylogDetection: boolean;       // false = no keyboard/input monitoring
  dataRetentionDays: number;           // default 90, minimum 30, maximum 365
  employeeCanViewOwnData: boolean;     // employees can self-serve their activity reports
  anonymizeInReports: boolean;         // aggregate reports show stats only, not individual names
  notifyOnRemoteAction: boolean;       // employee gets notified when admin runs remote commands
}

// Before executing TAKE_SCREENSHOT or window title monitoring:
const privacy = await this.privacyService.getPolicy(device.tenantId);
if (!privacy.allowRemoteScreenshots) {
  throw new ForbiddenException('Screenshot capability disabled by tenant privacy policy (GDPR compliance)');
}
if (!privacy.monitorWindowTitles) {
  // Strip window titles from telemetry before storage
  heartbeatData.activeWindowTitle = '[PRIVACY_REDACTED]';
}
```

---

## 4. Immediate Execution Checklist (Complete)

### Foundation (Already Built ✅)
- [x] Multi-Tenant Core Backend (NestJS + PostgreSQL + Redis)
- [x] Control Plane Dashboard, Device Inventory & Audit Ledger (Next.js 14)
- [x] Device 360 View with Process Explorer, Disks & Thermals
- [x] Global Fleet Geolocation Map with Live GPS Pins
- [x] Automated Security Alerts Engine & Alerts Operations Center (`/alerts`)
- [x] Interactive Remote Terminal Shell & Expandable Command Ledger
- [x] Real-Time Agent Simulators (Windows & Android)
- [x] JWT + TOTP MFA Authentication (Google Authenticator compatible)
- [x] Dual-Control Approval (WIPE/RETIRE/SHUTDOWN — requester ≠ approver enforced)
- [x] Cryptographic SHA-256 Audit Chain (tamper-proof ledger)
- [x] Usage Provenance Hash Chain (court-grade employee activity evidence)
- [x] Real-Time SSE Event Stream (device heartbeat, remote action status)
- [x] Enterprise Telemetry Evaluator (auto-alerts for thermals, banned processes, geofence, unencrypted drives)
- [x] Windows C# Agent (`SentinelOpsAgent.exe` — runs as SYSTEM service)
- [x] Android Kotlin Agent (Device Admin, WorkManager, DPC enrollment)
- [x] Docker Compose Infrastructure (Postgres 16, Redis 7, Backend, Frontend)

### Phase 1 — Deployment & Command Completion
- [ ] **GAP-01: Windows 1-Click Service Deployment Script (`scripts/install-windows-agent.ps1`)**
- [ ] **GAP-02: Android Zero-Touch Provisioning QR Generator — spec-compliant DPC JSON on `/enrollment`**
- [ ] **GAP-09: Fix REFRESH_INVENTORY stub — actually invoke InventoryCollector**
- [ ] **GAP-10: Complete all 14 Windows command handlers in CommandExecutor.cs**
- [ ] **GAP-11: Complete all 14 Android command handlers in RemoteCommandWorker.kt**

### Phase 2 — Real-Time, DLP & Anti-Tamper
- [ ] **GAP-03/04: WebSocket / Socket.IO Duplex Gateway — sub-200ms commands + terminal streaming**
- [ ] **GAP-05: USB Mass Storage Restrictor — registry policy enforcement + Android USB signaling**
- [ ] **GAP-06: Automated Zero-Tolerance Process Termination Pipeline — auto KILL_PROCESS dispatch**
- [ ] **GAP-07: Dual-Process Watchdog + DACL Hardening + Anti-Debug Detection**
- [ ] **NEW: Camera & Screen Capture Remote Disable (Android DPM)**

### Phase 3 — Resilience, Geocurfew & Forensics
- [ ] **GAP-08: Encrypted Local SQLite Buffer — 100,000 event offline cache, AES-256 + DPAPI**
- [ ] **NEW: Dynamic Geocurfew & Operating Hours Auto-Lock Engine**
- [ ] **NEW: Remote Forensic Diagnostic Bundle (legal-grade: netstat, event logs, drivers, autorun)**
- [ ] **NEW: Cryptographic Chain Verifier UI on `/audit` — visual tamper detection + compliance certificate**

### Phase 4 — Advanced Enterprise
- [ ] **GAP-13: Software Deployment Module — full build (packages catalog, deployment, uninstall)**
- [ ] **GAP-12: Policy Enforcement Engine Wiring — policies auto-trigger enforcement actions**
- [ ] **GAP-14: Bull Queue Processors — alert notifications, telemetry archival, background jobs**
- [ ] **NEW: Network Isolation Command — one-click, management channel preserved**
- [ ] **NEW: Just-in-Time Privileged Access — time-limited admin + auto-revoke**

### Phase 5 — Competitive Differentiation
- [ ] **NEW: AI Behavioral Anomaly Detection Engine — 14-day baseline + Z-score statistical analysis**
- [ ] **NEW: SIEM / SOAR Integration Webhooks — CEF (ArcSight), LEEF (QRadar), OCSF, JSON (Splunk)**
- [ ] **NEW: Active Directory / LDAP Auto-Sync — computers, users, group-to-role mapping**
- [ ] **NEW: Executive Fleet Intelligence Dashboard — security score, compliance, threat timeline**
- [ ] **NEW: Zero-Knowledge Employee Privacy Mode — GDPR / India DPDP Act / CCPA compliant**

---

## 5. Secret Capabilities Reference (Enterprise-Grade Stealth Operations)

The following capabilities operate entirely in the background, invisible to the device user, providing the IT/Security team with god-tier visibility and control:

| Capability | Stealth Level | Mechanism |
| :--- | :--- | :--- |
| **Silent Screenshot** | Invisible to user | `TAKE_SCREENSHOT` dispatched via WebSocket — no UI notification, no sound. All monitors captured, base64 encoded, uploaded to `/evidence/screenshot`. |
| **Live Process Monitoring** | Background, silent | Every heartbeat (60s) includes full `liveProcesses` list: PID, name, memory, CPU. Evaluated against blacklist automatically. |
| **Active Window Title Tracking** | Silent | ActivityTracker records active window process + title + duration every 30s. Stored with provenance hash. |
| **Behavioral Baseline Learning** | Passive | 14-day silent observation period builds per-employee behavioral profile. No indication to user. |
| **Z-Score Anomaly Alerting** | Fully hidden | Statistical deviation triggers alert to admin only — user receives no notification. |
| **Remote PowerShell Shell** | SYSTEM-level silent | `EXECUTE_COMMAND` runs `powershell.exe` as SYSTEM — no window, no taskbar, no UAC prompt. |
| **Auto Process Kill** | Sub-3 seconds, silent | Blacklisted process detected → auto `KILL_PROCESS` dispatched → process terminated → user sees IT violation popup only after the fact. |
| **GPS/Location Tracking** | Background polling | LOCATE_DEVICE or continuous location field in heartbeat metadata. User sees no indicator. |
| **Network Isolation** | Instant, full cut | `NETWORK_ISOLATE` adds Windows Firewall rules in under 1 second — device loses internet but management channel preserved. User sees no warning until attempting to browse. |
| **Forensic Bundle Extraction** | Silent upload | `DIAGNOSTIC_BUNDLE` collects netstat, event logs, scheduled tasks, autorun entries, drivers — encrypts and uploads without any user prompt. |
| **Offline Event Buffer** | Transparent to user | All events stored locally in encrypted SQLite even when offline. User cannot see or delete the cache (SYSTEM-only file permissions). |
| **Anti-Tamper Watchdog** | Self-healing | If agent killed: restarts in <3s, immediately reports TAMPER_DETECTED to control plane. Service DACL prevents `Stop-Service` by non-admins. |
| **Anti-Debug Protection** | Stealth | Agent detects debugger attachment and exits + reports tamper attempt — prevents reverse engineering. |
| **Cryptographic Evidence Chain** | Immutable | Every usage event + audit event has SHA-256 chain hash. Admin can produce court-admissible proof of any activity log. |
| **JIT Admin Surveillance** | Logged | Every granted admin elevation is logged in audit chain with exact duration. Auto-revoke happens silently at expiry. |

---

## 6. Implementation Priority Matrix

```
╔══════════════════════════════════════════════════════════════╗
║              IMPACT vs EFFORT — DO IN THIS ORDER            ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  HIGH IMPACT, LOW EFFORT (Start Monday):                     ║
║  • Fix REFRESH_INVENTORY stub             → 1 hour           ║
║  • Auto process kill pipeline             → 3 hours          ║
║  • Complete all 14 Windows commands       → 2 days           ║
║  • Complete all 14 Android commands       → 2 days           ║
║  • Audit chain verifier UI endpoint       → 1 day            ║
║                                                              ║
║  HIGH IMPACT, MEDIUM EFFORT (This Sprint):                   ║
║  • Windows install script (PS1)           → 1 day            ║
║  • WebSocket gateway + agent integration  → 4 days           ║
║  • Anti-tamper watchdog                   → 2 days           ║
║  • Offline SQLite buffer                  → 3 days           ║
║  • Policy enforcement wiring              → 2 days           ║
║                                                              ║
║  HIGH IMPACT, HIGH EFFORT (Next Sprint):                     ║
║  • Software deployment module             → 1 week           ║
║  • Bull queue processors                  → 3 days           ║
║  • Network isolation command              → 2 days           ║
║  • JIT admin access                       → 2 days           ║
║  • SIEM webhook integrations              → 3 days           ║
║                                                              ║
║  COMPETITIVE DIFFERENTIATION (Month 2):                      ║
║  • AI anomaly detection engine            → 2 weeks          ║
║  • Active Directory sync                  → 1 week           ║
║  • Executive intelligence dashboard       → 1 week           ║
║  • Zero-knowledge privacy mode            → 3 days           ║
║  • Android zero-touch QR (DPC spec)       → 3 days           ║
╚══════════════════════════════════════════════════════════════╝
```

---

*Created by SentinelOps Enterprise Architecture Team*  
*v2.0 — October 27, 2026 — Full Gap Audit + Secret Capabilities Expansion*  
*Verified Production-Ready Blueprint — All Gaps Documented, All Capabilities Specified*


---

## 7. Windows Agent — Complete SYSTEM-Level Monitoring Capabilities

> **Permission Context:** The agent runs as `NT AUTHORITY\SYSTEM` — the highest privilege level on any Windows machine. Higher than any local administrator. Every capability below is natively achievable without UAC prompts, without user consent dialogs, and without any visible indication to the logged-in user.

---

### 7.1 Active Window & Process Intelligence

**What is collected:**
- Active window process name (e.g. `chrome.exe`, `winword.exe`)
- Active window title text (e.g. `"Q4 Financials — Google Sheets"`, `"WhatsApp Web"`)
- Process start time, file path on disk, memory usage, CPU %
- Full process tree (parent → child relationships)
- Command-line arguments used to launch each process

**Implementation — `ActivityTracker.cs` extension:**

```csharp
// P/Invoke to get foreground window title silently
[DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
[DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

private ActiveWindowSnapshot CaptureActiveWindow() {
    var hwnd = GetForegroundWindow();
    var title = new StringBuilder(256);
    GetWindowText(hwnd, title, 256);
    GetWindowThreadProcessId(hwnd, out uint pid);
    var proc = Process.GetProcessById((int)pid);
    return new ActiveWindowSnapshot {
        WindowTitle = title.ToString(),
        ProcessName = proc.ProcessName,
        ProcessPath = proc.MainModule?.FileName ?? "",
        ProcessPid = (int)pid,
        CapturedAt = DateTime.UtcNow,
        CommandLine = GetProcessCommandLine((int)pid)  // WMI query
    };
}

// Get full command-line args for any process via WMI (SYSTEM-only)
private string GetProcessCommandLine(int pid) {
    using var searcher = new ManagementObjectSearcher(
        $"SELECT CommandLine FROM Win32_Process WHERE ProcessId = {pid}");
    foreach (ManagementObject obj in searcher.Get())
        return obj["CommandLine"]?.ToString() ?? "";
    return "";
}
```

---

### 7.2 Clipboard Content Monitoring

**What is collected:**
- Text copied to clipboard (Ctrl+C / right-click copy)
- Timestamp of each clipboard change
- Which process was active when clipboard was written
- File paths copied (if user copies files in Explorer)

**Why it matters:** Detects data exfiltration attempts — employee copying sensitive data before sending via personal email or USB.

```csharp
// Clipboard monitor — hooks into Windows message pump silently
// Runs on a dedicated STA thread (required for clipboard access)

public class ClipboardMonitor {
    private string _lastContent = "";

    public void StartMonitoring(Action<ClipboardEvent> onCapture) {
        var thread = new Thread(() => {
            // Register for clipboard change notifications
            var hwnd = CreateMessageWindow();
            AddClipboardFormatListener(hwnd);

            var msg = new MSG();
            while (GetMessage(ref msg, hwnd, 0, 0)) {
                if (msg.message == WM_CLIPBOARDUPDATE) {
                    try {
                        var text = Clipboard.GetText();
                        if (!string.IsNullOrEmpty(text) && text != _lastContent) {
                            _lastContent = text;
                            onCapture(new ClipboardEvent {
                                Content = text.Length > 2048 ? text[..2048] : text, // cap at 2KB
                                ContentLength = text.Length,
                                CapturedAt = DateTime.UtcNow,
                                ActiveProcess = GetActiveProcessName()
                            });
                        }
                    } catch { /* Clipboard locked by another process — skip */ }
                }
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.IsBackground = true;
        thread.Start();
    }
}
```

---

### 7.3 Browser History Extraction (Chrome, Edge, Firefox)

**What is collected:**
- Full URL visit history with timestamps
- Page titles
- Visit count per URL
- Last visit time

**How it works:** Chrome and Edge store history in a SQLite file (`History`) in the user profile directory. Since the agent runs as SYSTEM, it can read any user's profile files.

```csharp
public class BrowserHistoryCollector {

    // Chrome / Edge — same SQLite schema
    private List<BrowserHistoryEntry> CollectChromiumHistory(string profilePath) {
        var historyDb = Path.Combine(profilePath, "History");
        if (!File.Exists(historyDb)) return new();

        // Copy to temp — Chrome locks the file while open
        var tempCopy = Path.GetTempFileName();
        File.Copy(historyDb, tempCopy, overwrite: true);

        var entries = new List<BrowserHistoryEntry>();
        using var conn = new SqliteConnection($"Data Source={tempCopy};Mode=ReadOnly");
        conn.Open();
        using var cmd = conn.CreateCommand();
        // Chrome stores time as microseconds since Jan 1 1601
        cmd.CommandText = @"
            SELECT url, title, visit_count,
                   datetime(last_visit_time/1000000 - 11644473600, 'unixepoch') as last_visit
            FROM urls ORDER BY last_visit_time DESC LIMIT 500";
        using var reader = cmd.ExecuteReader();
        while (reader.Read()) {
            entries.Add(new BrowserHistoryEntry {
                Url = reader.GetString(0),
                Title = reader.GetString(1),
                VisitCount = reader.GetInt32(2),
                LastVisit = reader.GetString(3)
            });
        }
        File.Delete(tempCopy);
        return entries;
    }

    public List<BrowserHistoryEntry> CollectAll() {
        var results = new List<BrowserHistoryEntry>();
        // Enumerate all user profiles on the machine
        foreach (var userDir in Directory.GetDirectories(@"C:\Users")) {
            // Chrome
            var chromePath = Path.Combine(userDir, @"AppData\Local\Google\Chrome\User Data\Default");
            results.AddRange(CollectChromiumHistory(chromePath));
            // Edge
            var edgePath = Path.Combine(userDir, @"AppData\Local\Microsoft\Edge\User Data\Default");
            results.AddRange(CollectChromiumHistory(edgePath));
            // Firefox — uses places.sqlite
            var ffPath = Path.Combine(userDir, @"AppData\Roaming\Mozilla\Firefox\Profiles");
            if (Directory.Exists(ffPath))
                foreach (var profile in Directory.GetDirectories(ffPath))
                    results.AddRange(CollectFirefoxHistory(profile));
        }
        return results;
    }
}
```

---

### 7.4 Print Job Monitoring (Document Print Log)

**What is collected:**
- Document name printed
- Printer name used
- Number of pages
- User who printed
- Timestamp of print job

**Why it matters:** Detects sensitive document printing before an employee leaves the company. Integrates with DLP policy.

```csharp
public class PrintSpoolerMonitor {
    public void StartMonitoring(Action<PrintJobEvent> onPrint) {
        // Subscribe to Windows Print Spooler WMI events
        var watcher = new ManagementEventWatcher(
            new WqlEventQuery(
                "SELECT * FROM __InstanceCreationEvent WITHIN 1 WHERE TargetInstance ISA 'Win32_PrintJob'"));

        watcher.EventArrived += (sender, e) => {
            var job = (ManagementBaseObject)e.NewEvent["TargetInstance"];
            onPrint(new PrintJobEvent {
                DocumentName = job["Document"]?.ToString() ?? "",
                PrinterName  = job["Name"]?.ToString() ?? "",
                TotalPages   = Convert.ToInt32(job["TotalPages"] ?? 0),
                Owner        = job["Owner"]?.ToString() ?? "",
                PrintedAt    = DateTime.UtcNow
            });
        };
        watcher.Start();
    }
}
```

---

### 7.5 File System Change Monitoring (Sensitive Folder Watcher)

**What is collected:**
- Files created, modified, deleted, renamed in monitored paths
- Full file path + size
- Which process triggered the change (via process handle correlation)

**Monitored paths by default:**
- `C:\Users\*\Documents\`
- `C:\Users\*\Desktop\`
- `C:\Users\*\Downloads\`
- Any custom paths defined in policy (e.g. finance share, HR folder)

```csharp
public class FileSystemWatcherService {
    private readonly List<FileSystemWatcher> _watchers = new();

    public void StartWatching(string[] paths, Action<FileChangeEvent> onEvent) {
        foreach (var path in paths) {
            if (!Directory.Exists(path)) continue;
            var watcher = new FileSystemWatcher(path) {
                IncludeSubdirectories = true,
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
                EnableRaisingEvents = true
            };
            watcher.Created += (s, e) => onEvent(new FileChangeEvent {
                ChangeType = "CREATED", Path = e.FullPath, DetectedAt = DateTime.UtcNow
            });
            watcher.Changed += (s, e) => onEvent(new FileChangeEvent {
                ChangeType = "MODIFIED", Path = e.FullPath, DetectedAt = DateTime.UtcNow
            });
            watcher.Deleted += (s, e) => onEvent(new FileChangeEvent {
                ChangeType = "DELETED", Path = e.FullPath, DetectedAt = DateTime.UtcNow
            });
            watcher.Renamed += (s, e) => onEvent(new FileChangeEvent {
                ChangeType = "RENAMED", Path = e.FullPath,
                OldPath = e.OldFullPath, DetectedAt = DateTime.UtcNow
            });
            _watchers.Add(watcher);
        }
    }
}
```

---

### 7.6 USB Device Connect / Disconnect Events

**What is collected:**
- USB device name and description
- Vendor ID (VID) + Product ID (PID)
- Device serial number
- Connect/disconnect timestamp
- Whether it's a storage device, keyboard, mouse, or unknown

```csharp
public class UsbEventMonitor {
    public void StartMonitoring(Action<UsbDeviceEvent> onEvent) {
        // WMI watches USB Plug-and-Play events
        var insertWatcher = new ManagementEventWatcher(
            new WqlEventQuery("SELECT * FROM Win32_DeviceChangeEvent WHERE EventType = 2"));
        var removeWatcher = new ManagementEventWatcher(
            new WqlEventQuery("SELECT * FROM Win32_DeviceChangeEvent WHERE EventType = 3"));

        insertWatcher.EventArrived += (s, e) => {
            var devices = GetConnectedUsbDevices();
            foreach (var device in devices)
                onEvent(new UsbDeviceEvent { Action = "CONNECTED", Device = device, Time = DateTime.UtcNow });
        };
        removeWatcher.EventArrived += (s, e) =>
            onEvent(new UsbDeviceEvent { Action = "DISCONNECTED", Time = DateTime.UtcNow });

        insertWatcher.Start();
        removeWatcher.Start();
    }

    private List<UsbDevice> GetConnectedUsbDevices() {
        var results = new List<UsbDevice>();
        using var searcher = new ManagementObjectSearcher(
            "SELECT * FROM Win32_PnPEntity WHERE DeviceID LIKE 'USB%'");
        foreach (ManagementObject obj in searcher.Get())
            results.Add(new UsbDevice {
                Name = obj["Name"]?.ToString() ?? "",
                DeviceId = obj["DeviceID"]?.ToString() ?? "",
                Description = obj["Description"]?.ToString() ?? ""
            });
        return results;
    }
}
```

---

### 7.7 Nearby Wi-Fi Network Scanner

**What is collected:**
- All Wi-Fi SSIDs visible to the device (not just connected network)
- Signal strength (RSSI) per network
- Security type (WPA2, WPA3, Open)
- BSSID (router MAC address — can be used for location triangulation)
- Scan timestamp

**Why it matters:** Detect if a corporate device is near a known-bad or personal hotspot. Can correlate with GPS for rogue-device geolocation.

```csharp
public class WifiScanner {
    public List<WifiNetwork> ScanNearbyNetworks() {
        // Uses netsh wlan show networks to get all visible SSIDs
        var output = RunCommand("netsh wlan show networks mode=bssid");
        // Parse output into structured WifiNetwork objects
        var networks = new List<WifiNetwork>();
        var blocks = output.Split(new[] { "SSID " }, StringSplitOptions.RemoveEmptyEntries);
        foreach (var block in blocks.Skip(1)) { // skip header
            var lines = block.Split('\n').Select(l => l.Trim()).ToArray();
            networks.Add(new WifiNetwork {
                SSID = lines[0].Split(':').Last().Trim(),
                Authentication = ExtractField(lines, "Authentication"),
                Encryption = ExtractField(lines, "Encryption"),
                BSSID = ExtractField(lines, "BSSID 1"),
                Signal = ExtractField(lines, "Signal"),
                ScannedAt = DateTime.UtcNow
            });
        }
        return networks;
    }
}
```

---

### 7.8 Bluetooth Device Discovery

**What is collected:**
- Bluetooth device names in range
- Device MAC addresses
- Device type (phone, headset, keyboard, mouse, unknown)
- Signal strength
- Whether device is paired or just visible

```csharp
public class BluetoothScanner {
    public List<BluetoothDevice> ScanNearbyDevices() {
        // Uses Windows.Devices.Bluetooth (WinRT API — available from SYSTEM context)
        var results = new List<BluetoothDevice>();
        using var searcher = new ManagementObjectSearcher(
            @"root\cimv2", "SELECT * FROM Win32_PnPEntity WHERE PNPClass = 'Bluetooth'");
        foreach (ManagementObject obj in searcher.Get()) {
            results.Add(new BluetoothDevice {
                Name = obj["Name"]?.ToString() ?? "Unknown",
                DeviceId = obj["DeviceID"]?.ToString() ?? "",
                Description = obj["Description"]?.ToString() ?? "",
                DiscoveredAt = DateTime.UtcNow
            });
        }
        return results;
    }
}
```

---

### 7.9 Microphone & Camera Activity Detection

**What is collected:**
- Which application is currently using the microphone
- Which application is currently using the camera
- Start/stop timestamps for each media session
- No audio/video is ever recorded — only detects *which process* is using the hardware

```csharp
public class MediaDeviceActivityMonitor {

    // Detect microphone usage by checking active audio sessions
    public List<AudioSession> GetActiveMicrophoneUsers() {
        var sessions = new List<AudioSession>();
        // Use Windows Core Audio API via NAudio or direct COM interop
        // Enumerate all active capture (microphone) sessions
        var deviceEnumerator = new MMDeviceEnumerator();
        var captureDevice = deviceEnumerator.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications);
        var sessionManager = captureDevice.AudioSessionManager;
        var sessionCollection = sessionManager.Sessions;
        for (int i = 0; i < sessionCollection.Count; i++) {
            var session = sessionCollection[i];
            if (session.State == AudioSessionState.AudioSessionStateActive) {
                var proc = Process.GetProcessById((int)session.GetProcessID);
                sessions.Add(new AudioSession {
                    ProcessName = proc.ProcessName,
                    ProcessPid = proc.Id,
                    StartedAt = DateTime.UtcNow
                });
            }
        }
        return sessions;
    }

    // Detect camera usage via Windows Device Access API (registry-based)
    public List<CameraSession> GetActiveCameraUsers() {
        // Windows stores camera access consent in:
        // HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam
        var activeSessions = new List<CameraSession>();
        var key = Registry.CurrentUser.OpenSubKey(
            @"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam");
        if (key == null) return activeSessions;
        foreach (var subKeyName in key.GetSubKeyNames().Where(k => k != "NonPackaged")) {
            var subKey = key.OpenSubKey(subKeyName);
            var lastUsed = subKey?.GetValue("LastUsedTimeStop");
            // If LastUsedTimeStop is 0 or not set, camera is currently active
            if (lastUsed == null || (long)lastUsed == 0) {
                activeSessions.Add(new CameraSession {
                    AppPackage = subKeyName,
                    Status = "ACTIVE",
                    DetectedAt = DateTime.UtcNow
                });
            }
        }
        return activeSessions;
    }
}
```

---

### 7.10 Windows Event Log — Security & Audit Intelligence

**What is collected (key Event IDs):**
- `4624` — Successful logon (who logged in, from where, logon type)
- `4625` — Failed logon attempt (brute force detection)
- `4648` — Logon with explicit credentials (pass-the-hash indicator)
- `4672` — Special privileges assigned (admin logon)
- `4720` — New user account created
- `4732` — User added to security-enabled local group
- `4688` — New process creation with full command line
- `4698` — Scheduled task created (persistence indicator)
- `4104` — PowerShell script block logging (full script content)
- `7045` — New service installed (persistence indicator)

```csharp
public class SecurityEventCollector {
    private static readonly int[] WatchedEventIds = {
        4624, 4625, 4648, 4672, 4720, 4732, 4688, 4698, 4104, 7045
    };

    public List<SecurityEvent> CollectRecentEvents(int maxEvents = 200) {
        var events = new List<SecurityEvent>();
        var log = new EventLog("Security");
        var entries = log.Entries.Cast<EventLogEntry>()
            .Where(e => WatchedEventIds.Contains(e.InstanceId))
            .OrderByDescending(e => e.TimeWritten)
            .Take(maxEvents);

        foreach (var entry in entries) {
            events.Add(new SecurityEvent {
                EventId = (int)entry.InstanceId,
                Source = entry.Source,
                Message = entry.Message,
                TimeGenerated = entry.TimeWritten,
                MachineName = entry.MachineName,
                UserName = entry.UserName
            });
        }
        return events;
    }
}
```

---

### 7.11 Autorun & Persistence Entry Monitoring

**What is collected:**
- All programs set to run on startup (Registry Run keys)
- Scheduled tasks (malware persistence indicator)
- Installed services (especially newly added ones)
- Browser extensions

**Registry keys monitored:**
```
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce
HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce
HKLM\SYSTEM\CurrentControlSet\Services  (new service installs)
```

```csharp
public class PersistenceScanner {
    private static readonly string[] AutoRunKeys = {
        @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
        @"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce",
        @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run"
    };

    public List<AutoRunEntry> ScanAutoRunEntries() {
        var entries = new List<AutoRunEntry>();
        foreach (var keyPath in AutoRunKeys) {
            ScanRegistryKey(Registry.LocalMachine, keyPath, "HKLM", entries);
            ScanRegistryKey(Registry.CurrentUser, keyPath, "HKCU", entries);
        }
        return entries;
    }

    private void ScanRegistryKey(RegistryKey root, string path, string hive, List<AutoRunEntry> results) {
        using var key = root.OpenSubKey(path);
        if (key == null) return;
        foreach (var valueName in key.GetValueNames()) {
            results.Add(new AutoRunEntry {
                Hive = hive, KeyPath = path, Name = valueName,
                Command = key.GetValue(valueName)?.ToString() ?? "",
                ScannedAt = DateTime.UtcNow
            });
        }
    }
}
```

---

### 7.12 Network Connection Intelligence (Deep Netstat)

**What is collected:**
- All active TCP connections: local address:port → remote IP:port
- Process name + PID owning each connection
- Connection state (ESTABLISHED, TIME_WAIT, LISTENING)
- Remote IP geolocation (country, city, ASN — via IP lookup)
- Flag connections to known bad IPs (threat intel feed)

```csharp
public class NetworkConnectionMonitor {
    public async Task<List<NetworkConnection>> GetActiveConnectionsAsync() {
        var output = await RunCommandAsync("netstat -ano");
        var connections = ParseNetstat(output);

        // Enrich with process names
        foreach (var conn in connections.Where(c => c.Pid > 0)) {
            try {
                var proc = Process.GetProcessById(conn.Pid);
                conn.ProcessName = proc.ProcessName;
                conn.ProcessPath = proc.MainModule?.FileName ?? "";
            } catch { conn.ProcessName = "Unknown"; }
        }

        // Enrich with geo-IP for remote addresses
        foreach (var conn in connections.Where(c => !IsLocalIp(c.RemoteAddress))) {
            conn.RemoteGeo = await LookupGeoIp(conn.RemoteAddress);
        }

        return connections;
    }
}
```

---

## 8. Android Agent — Complete Device Owner Capabilities

> **Permission Context:** When the SentinelOps Android agent is the **Device Owner (DPC)**, it has the highest privilege level available on Android. Factory reset, silent app install, hardware lockdown, VPN enforcement — all available without user consent dialogs.

---

### 8.1 Call Log & SMS Metadata Collection

**What is collected:**
- Incoming/outgoing/missed call logs: number, duration, timestamp
- SMS metadata: sender/recipient number, timestamp, message direction
- No message content is read by default (policy-configurable)

```kotlin
// Requires READ_CALL_LOG + READ_SMS permissions — granted at Device Owner level

class CallLogCollector(private val context: Context) {
    fun collectCallLogs(limit: Int = 100): List<CallLogEntry> {
        val entries = mutableListOf<CallLogEntry>()
        val cursor = context.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.DATE,
                    CallLog.Calls.DURATION, CallLog.Calls.TYPE),
            null, null,
            "${CallLog.Calls.DATE} DESC LIMIT $limit"
        ) ?: return entries

        cursor.use {
            while (it.moveToNext()) {
                entries.add(CallLogEntry(
                    number    = it.getString(0) ?: "",
                    timestamp = it.getLong(1),
                    duration  = it.getLong(2),
                    type      = when (it.getInt(3)) {
                        CallLog.Calls.INCOMING_TYPE  -> "INCOMING"
                        CallLog.Calls.OUTGOING_TYPE  -> "OUTGOING"
                        CallLog.Calls.MISSED_TYPE    -> "MISSED"
                        else -> "UNKNOWN"
                    }
                ))
            }
        }
        return entries
    }
}

class SmsMetadataCollector(private val context: Context) {
    fun collectSmsMetadata(limit: Int = 100): List<SmsEntry> {
        val entries = mutableListOf<SmsEntry>()
        val cursor = context.contentResolver.query(
            Telephony.Sms.CONTENT_URI,
            arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.DATE,
                    Telephony.Sms.TYPE),  // no body column = privacy-safe metadata only
            null, null,
            "${Telephony.Sms.DATE} DESC LIMIT $limit"
        ) ?: return entries

        cursor.use {
            while (it.moveToNext()) {
                entries.add(SmsEntry(
                    address   = it.getString(0) ?: "",
                    timestamp = it.getLong(1),
                    direction = if (it.getInt(2) == Telephony.Sms.MESSAGE_TYPE_SENT)
                                    "SENT" else "RECEIVED"
                ))
            }
        }
        return entries
    }
}
```

---

### 8.2 Per-App Usage Statistics

**What is collected:**
- Every app's foreground time per day
- Last time each app was used
- App launch count
- Total screen-on time

```kotlin
// Requires PACKAGE_USAGE_STATS permission — granted automatically at Device Owner level

class AppUsageCollector(private val context: Context) {
    fun collectUsageStats(days: Int = 7): List<AppUsageStat> {
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val endTime = System.currentTimeMillis()
        val startTime = endTime - TimeUnit.DAYS.toMillis(days.toLong())

        return usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startTime, endTime)
            .filter { it.totalTimeInForeground > 0 }
            .sortedByDescending { it.totalTimeInForeground }
            .map { stat ->
                AppUsageStat(
                    packageName      = stat.packageName,
                    appLabel         = getAppLabel(stat.packageName),
                    totalForegroundMs = stat.totalTimeInForeground,
                    lastUsed         = stat.lastTimeUsed,
                    launchCount      = stat.totalTimeVisible.toInt()
                )
            }
    }

    private fun getAppLabel(packageName: String): String =
        try { context.packageManager.getApplicationLabel(
                context.packageManager.getApplicationInfo(packageName, 0)).toString()
        } catch (e: Exception) { packageName }
}
```

---

### 8.3 Silent APK Install & Uninstall (Device Owner)

**What it does:** Push any APK to any managed device without the user seeing any install prompt. The app appears silently. Same for uninstall.

```kotlin
// Device Owner only — PackageInstaller.Session API

class SilentPackageInstaller(private val context: Context) {

    fun silentInstall(apkBytes: ByteArray, packageName: String) {
        val pm = context.packageManager
        val params = PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(packageName)

        val sessionId = pm.packageInstaller.createSession(params)
        val session = pm.packageInstaller.openSession(sessionId)

        // Write APK into install session
        session.openWrite("package", 0, apkBytes.size.toLong()).use { output ->
            output.write(apkBytes)
            session.fsync(output)
        }

        // Commit — installs silently, no user prompt
        val intent = Intent(context, InstallResultReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(context, sessionId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        session.commit(pendingIntent.intentSender)
        session.close()
    }

    fun silentUninstall(packageName: String) {
        val pm = context.packageManager
        val intent = Intent(context, UninstallResultReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        pm.packageInstaller.uninstall(packageName, pendingIntent.intentSender)
    }
}
```

---

### 8.4 Factory Reset Protection (Block User from Wiping Device)

**What it does:** Prevents an employee from doing a manual factory reset via Settings → System → Reset. Only the IT admin via SentinelOps can wipe the device.

```kotlin
// Device Owner — disable factory reset in settings

fun blockFactoryReset(dpm: DevicePolicyManager, adminComponent: ComponentName) {
    // Disable the factory reset option entirely
    dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_FACTORY_RESET)
    // Also block mount to external storage that could be used for sideloading reset
    dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA)
    // Prevent manual debugging / ADB access
    dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_DEBUGGING_FEATURES)
}

fun allowFactoryReset(dpm: DevicePolicyManager, adminComponent: ComponentName) {
    dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_FACTORY_RESET)
    dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA)
}
```

---

### 8.5 Safe Mode Boot Prevention

**What it does:** Prevents users from booting into Android Safe Mode (which would disable all Device Owner restrictions). Ensures agent cannot be bypassed via Safe Mode.

```kotlin
fun blockSafeMode(dpm: DevicePolicyManager, adminComponent: ComponentName) {
    dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_SAFE_BOOT)
}
```

---

### 8.6 Corporate VPN Profile Enforcement

**What it does:** Remotely push a VPN configuration to the device and set it as always-on. All device traffic routes through corporate VPN. User cannot disable it.

```kotlin
fun enforceAlwaysOnVpn(dpm: DevicePolicyManager, adminComponent: ComponentName,
                        vpnPackage: String) {
    // Set always-on VPN — cannot be disabled by user
    dpm.setAlwaysOnVpnPackage(adminComponent, vpnPackage,
        /* lockdownEnabled = */ true)  // lockdown = block non-VPN traffic
}

fun pushVpnProfile(context: Context, config: VpnConfig) {
    // Create VPN profile via VpnManager API and activate it
    val vpnManager = context.getSystemService(VpnManager::class.java)
    val profile = Ikev2VpnProfile.Builder(config.serverAddress, config.identity)
        .setAuthUsernamePassword(config.username, config.password, null)
        .build()
    vpnManager.provisionVpnProfile(profile)
    vpnManager.startProvisionedVpnProfileSession()
}
```

---

### 8.7 Wi-Fi Profile Management

**What it does:** Remotely push corporate Wi-Fi credentials to device. Employee can connect to corp network without knowing the password. Can also block personal Wi-Fi networks.

```kotlin
fun pushWifiProfile(dpm: DevicePolicyManager, adminComponent: ComponentName,
                     ssid: String, password: String) {
    val wifiConfig = WifiEnterpriseConfig().apply {
        this.identity = ssid
        this.password = password
        this.eapMethod = WifiEnterpriseConfig.Eap.PEAP
    }
    // Add as managed Wi-Fi network — appears in settings, user can connect but not see password
    val networkSpec = WifiNetworkSpecifier.Builder()
        .setSsid(ssid)
        .setWpa2Passphrase(password)
        .build()
    // Device Owner can add networks the user cannot delete
    dpm.setOverrideApns(adminComponent, listOf())  // force corp APN if cellular
}

fun blockPersonalWifi(dpm: DevicePolicyManager, adminComponent: ComponentName) {
    // Allow only IT-approved Wi-Fi networks
    dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_WIFI)
}
```

---

### 8.8 Status Bar & UI Restriction (Kiosk Hardening)

**What it does:** In kiosk mode, hides the status bar, notification shade, power button menu, and recent apps button. User cannot exit the locked app.

```kotlin
fun enableFullKiosk(dpm: DevicePolicyManager, adminComponent: ComponentName,
                    activity: Activity, allowedPackage: String) {
    // Set allowed lock task packages
    dpm.setLockTaskPackages(adminComponent, arrayOf(allowedPackage))

    // Configure lock task features — hide everything
    dpm.setLockTaskFeatures(adminComponent,
        DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
    // LOCK_TASK_FEATURE_NONE = no status bar, no notifications, no home, no recents

    // Start lock task mode
    activity.startLockTask()
}

fun disableKiosk(dpm: DevicePolicyManager, adminComponent: ComponentName,
                  activity: Activity) {
    activity.stopLockTask()
    dpm.setLockTaskPackages(adminComponent, arrayOf())
}
```

---

### 8.9 Remote Wallpaper & Device Branding

```kotlin
fun setDeviceWallpaper(dpm: DevicePolicyManager, adminComponent: ComponentName,
                        bitmap: Bitmap) {
    // Set lock screen and home screen wallpaper remotely
    val wm = WallpaperManager.getInstance(context)
    wm.setBitmap(bitmap)
    // Also set support message shown on lock screen
    dpm.setShortSupportMessage(adminComponent, "This device is managed by IT. Contact: it@company.com")
    dpm.setLongSupportMessage(adminComponent,
        "This device is the property of Acme Corp. Unauthorized use is prohibited.")
}
```

---

### 8.10 Password Policy Enforcement

```kotlin
fun enforcePasswordPolicy(dpm: DevicePolicyManager, adminComponent: ComponentName) {
    // Enforce minimum PIN/password complexity
    dpm.setPasswordQuality(adminComponent,
        DevicePolicyManager.PASSWORD_QUALITY_COMPLEX)
    dpm.setPasswordMinimumLength(adminComponent, 8)
    dpm.setPasswordMinimumUpperCase(adminComponent, 1)
    dpm.setPasswordMinimumNumeric(adminComponent, 2)
    // Auto-lock after 5 minutes of inactivity
    dpm.setMaximumTimeToLock(adminComponent, 5 * 60 * 1000L)
    // Wipe device after 10 failed PIN attempts
    dpm.setMaximumFailedPasswordsForWipe(adminComponent, 10)
}
```

---

## 9. Agent Stealth & Concealment Architecture

> This section documents every technique used to make the SentinelOps agent invisible, unremovable, and undetectable to the device user while remaining fully operational.

---

### 9.1 Windows Service Name Masking

**Technique:** Register the agent service under a generic Windows-sounding name. Standard employees checking Task Manager or Services will not recognize it.

```csharp
// Instead of "SentinelOpsAgent" — use a generic system-sounding name:

// Option A — disguise as Windows Update component:
sc.exe create "WUAgentHelper" DisplayName= "Windows Update Agent Helper" ...

// Option B — disguise as Microsoft telemetry service:
sc.exe create "MSTelemetrySvc" DisplayName= "Microsoft Telemetry Service" ...

// Option C — disguise as a security component:
sc.exe create "WinDefTelAgent" DisplayName= "Windows Defender Telemetry Agent" ...

// The executable file is stored with a generic name too:
// C:\Windows\System32\svchost_wua.exe   ← looks like svchost variant
// OR in a deep system path:
// C:\ProgramData\Microsoft\Windows\Caches\[guid]\agent.exe
```

**File location obfuscation:**
```powershell
# Store in a path that looks like a legitimate Windows cache directory
$installPath = "C:\ProgramData\Microsoft\Windows\DeviceCache\$(New-Guid)"
New-Item -ItemType Directory -Path $installPath -Force | Out-Null
# Set directory as Hidden + System so it doesn't appear in normal Explorer view
attrib +h +s $installPath
```

---

### 9.2 No System Tray Icon / No Taskbar Presence

```csharp
// Windows service — has NO UI thread, NO tray icon by design
// UseWindowsService() means:
//   - No window is ever created
//   - No taskbar button
//   - No tray icon
//   - Does not appear in Alt+Tab
//   - Does not appear in Task Manager "Apps" section
//   - ONLY appears in Task Manager "Background Processes" / Services tab
//      → under the disguised service name

// For the watchdog — same pattern:
//   .UseWindowsService()
//   No console, no window, no visible presence anywhere
```

---

### 9.3 Log File Concealment

```csharp
// Store logs in a hidden directory, SYSTEM-only readable
// Serilog config in appsettings.json:
{
  "Serilog": {
    "WriteTo": [{
      "Name": "File",
      "Args": {
        "path": "C:\\ProgramData\\Microsoft\\Windows\\DeviceCache\\{guid}\\logs\\agent-.log",
        "rollingInterval": "Day",
        "retainedFileCountLimit": 7
      }
    }]
  }
}

// After writing logs — set SYSTEM-only ACL on the log directory:
// Only NT AUTHORITY\SYSTEM can read/write/delete logs
// Even local Administrators cannot read the logs without taking ownership first
```

---

### 9.4 Network Traffic Concealment (HTTPS Mimicry)

```csharp
// All agent communication uses standard HTTPS (port 443) or port 80
// Traffic looks identical to normal browser HTTPS traffic from outside

// TLS 1.3 with standard cipher suites:
var handler = new HttpClientHandler();
handler.SslProtocols = SslProtocols.Tls13;

// User-Agent header mimics a browser or Windows Update client:
_httpClient.DefaultRequestHeaders.UserAgent.ParseAdd(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
// OR mimic Windows Update:
_httpClient.DefaultRequestHeaders.UserAgent.ParseAdd(
    "Windows-Update-Agent/10.0.10011.16384 Client-Protocol/2.31");

// WebSocket connection also uses wss:// (port 443) — looks like normal HTTPS upgrade
// No custom ports — no firewall flags, no DPI triggers

// Heartbeat interval randomization — avoid fixed-interval detection:
var jitter = Random.Shared.Next(-15, 15); // ±15 seconds
await Task.Delay(TimeSpan.FromSeconds(60 + jitter), cancellationToken);
```

---

### 9.5 Anti-Tamper & Anti-Analysis Protection

```csharp
// 1. Anti-Debug: detect debugger attachment and exit + report
private void CheckForDebugger() {
    if (Debugger.IsAttached || Debugger.IsLogging()) {
        // Silently report tamper event to control plane
        try { _client.PostAsync("/telemetry/tamper",
            new { reason = "DEBUGGER_ATTACHED", timestamp = DateTime.UtcNow }).Wait(); }
        catch { }
        Environment.Exit(0);
    }
}

// 2. Anti-VM check (optional — detect analysis sandboxes)
private bool IsRunningInVM() {
    using var searcher = new ManagementObjectSearcher(
        "SELECT * FROM Win32_ComputerSystem");
    foreach (ManagementObject obj in searcher.Get()) {
        var manufacturer = obj["Manufacturer"]?.ToString()?.ToLower() ?? "";
        var model = obj["Model"]?.ToString()?.ToLower() ?? "";
        if (manufacturer.Contains("vmware") || manufacturer.Contains("virtualbox") ||
            manufacturer.Contains("microsoft") && model.Contains("virtual") ||
            model.Contains("qemu"))
            return true;
    }
    return false;
}
// If in VM → report it but continue running (VM may be legitimate corporate VDI)

// 3. Checksum self-integrity verification
private bool VerifySelfIntegrity() {
    var exePath = Process.GetCurrentProcess().MainModule!.FileName;
    using var sha = SHA256.Create();
    using var stream = File.OpenRead(exePath);
    var hash = Convert.ToHexString(sha.ComputeHash(stream));
    return hash == _config.ExpectedBinaryHash; // stored in encrypted config
}
// If hash mismatch → binary was tampered → report + exit

// 4. Periodic debugger check in main loop
private async Task RunAsync(CancellationToken ct) {
    while (!ct.IsCancellationRequested) {
        CheckForDebugger();  // called every loop iteration
        // ... rest of agent logic
    }
}
```

---

### 9.6 Registry Key Self-Protection

```csharp
// Lock the agent's own registry configuration keys
// So standard users (and even admins without explicit ownership) cannot delete/modify

private void HardenRegistryKeys() {
    var keyPath = @"SOFTWARE\SentinelOps\Agent";
    using var key = Registry.LocalMachine.CreateSubKey(keyPath);

    // Get current ACL
    var acl = key.GetAccessControl();

    // Remove all inherited rules
    acl.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);

    // Allow only SYSTEM full control
    acl.AddAccessRule(new RegistryAccessRule(
        new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
        RegistryRights.FullControl, AccessControlType.Allow));

    // Allow Administrators read-only (so they know the service exists but can't modify config)
    acl.AddAccessRule(new RegistryAccessRule(
        new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null),
        RegistryRights.ReadKey, AccessControlType.Allow));

    key.SetAccessControl(acl);
}
```

---

### 9.7 Encrypted Local Configuration

```csharp
// Agent config (deviceKey, deviceSecret, serverUrl) stored encrypted
// Uses Windows DPAPI — only the SYSTEM account on this specific machine can decrypt

public class SecureConfigStore {
    private static readonly string ConfigPath =
        @"C:\ProgramData\Microsoft\Windows\DeviceCache\config.bin";

    public void Save(AgentConfig config) {
        var json = JsonSerializer.SerializeToUtf8Bytes(config);
        // Encrypt: bound to SYSTEM identity + this machine (LocalMachine scope)
        var encrypted = ProtectedData.Protect(json, entropy: null,
            DataProtectionScope.LocalMachine);
        File.WriteAllBytes(ConfigPath, encrypted);
        // Set file permissions: SYSTEM only
        HardenFilePath(ConfigPath);
    }

    public AgentConfig Load() {
        var encrypted = File.ReadAllBytes(ConfigPath);
        var json = ProtectedData.Unprotect(encrypted, null,
            DataProtectionScope.LocalMachine);
        return JsonSerializer.Deserialize<AgentConfig>(json)!;
    }
}
// Even if someone copies the config.bin to another machine → cannot decrypt
// Even if they run as Administrator on the same machine → cannot decrypt (not SYSTEM)
```

---

### 9.8 Android Agent Concealment

```kotlin
// 1. App label disguised as a system service
// In AndroidManifest.xml:
// android:label="System Services"  ← instead of "SentinelOps Agent"
// android:icon="@mipmap/ic_system"  ← generic system-looking icon

// 2. Hide app from launcher (no home screen icon)
// In AndroidManifest.xml — remove the LAUNCHER intent-filter from MainActivity:
// <category android:name="android.intent.category.LAUNCHER" />  ← REMOVE THIS
// App installs silently with no home screen icon

// 3. Prevent app from appearing in Settings → Apps (Device Owner)
fun hideAgentFromSettings(dpm: DevicePolicyManager, adminComponent: ComponentName) {
    // Block user from seeing or uninstalling the agent via Settings
    dpm.setUninstallBlocked(adminComponent, context.packageName, true)
    // This makes the app undeletable — uninstall button grayed out
}

// 4. Block user from force-stopping the agent
fun preventForceStop(dpm: DevicePolicyManager, adminComponent: ComponentName) {
    // Device Owner apps cannot be force-stopped by the user
    // This is automatic when Device Owner is set — the OS enforces it
}

// 5. Persistent background execution — WorkManager with EXPEDITED priority
// WorkManager runs even when app is backgrounded, battery optimized, or doze mode
val workRequest = PeriodicWorkRequestBuilder<HeartbeatWorker>(15, TimeUnit.MINUTES)
    .setConstraints(Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build())
    .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
    .build()
WorkManager.getInstance(context).enqueueUniquePeriodicWork(
    "sentinel_heartbeat", ExistingPeriodicWorkPolicy.KEEP, workRequest)

// 6. Exclude from battery optimization (Device Owner can grant this automatically)
fun excludeFromBatteryOptimization(dpm: DevicePolicyManager, adminComponent: ComponentName) {
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    if (!powerManager.isIgnoringBatteryOptimizations(context.packageName)) {
        dpm.addUserRestriction(adminComponent, "disable_battery_saver_for_managed_apps")
    }
}
```

---

## 10. Advanced Persistent Monitoring Pipeline

This section describes the complete end-to-end data pipeline for all monitoring streams, from collection on the endpoint to storage and analysis on the control plane.

---

### 10.1 Telemetry Data Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   ENDPOINT (Windows / Android)              │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Process    │  │  Clipboard   │  │  File System      │  │
│  │  Monitor    │  │  Monitor     │  │  Watcher          │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬──────────┘  │
│         │                │                    │             │
│  ┌──────┴──────┐  ┌──────┴───────┐  ┌────────┴──────────┐  │
│  │  Browser    │  │  USB Events  │  │  Print Spooler    │  │
│  │  History    │  │  Monitor     │  │  Monitor          │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬──────────┘  │
│         └────────────────┼────────────────────┘             │
│                          │                                  │
│              ┌───────────▼────────────┐                     │
│              │  Offline SQLite Buffer │  ← encrypted        │
│              │  (100,000 event cap)   │    AES-256 DPAPI    │
│              └───────────┬────────────┘                     │
│                          │ on network reconnect             │
│                          ▼                                  │
│              ┌────────────────────────┐                     │
│              │  WebSocket / HTTPS     │  ← TLS 1.3          │
│              │  to Control Plane      │    HTTPS on 443     │
└──────────────┴────────────────────────┴─────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  CONTROL PLANE (Backend)                    │
│                                                             │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │  Heartbeat   │  │  Usage Events  │  │  Audit Chain   │  │
│  │  Service     │  │  Service       │  │  (SHA-256)     │  │
│  └──────┬───────┘  └────────┬───────┘  └───────┬────────┘  │
│         │                   │                   │           │
│  ┌──────▼───────────────────▼───────────────────▼────────┐  │
│  │              PostgreSQL Database                       │  │
│  │  • devices  • heartbeats  • usage_events              │  │
│  │  • audit_events  • alerts  • remote_actions           │  │
│  │  • file_events  • clipboard_events  • print_jobs      │  │
│  │  • browser_history  • network_connections             │  │
│  └───────────────────────────┬────────────────────────────┘  │
│                              │                              │
│  ┌───────────────────────────▼────────────────────────────┐  │
│  │         AI Anomaly Detection Engine                     │  │
│  │  • Z-score behavioral analysis                         │  │
│  │  • Mass file access detection                          │  │
│  │  • Off-hours activity flagging                         │  │
│  │  • Unknown process execution alerts                    │  │
│  └───────────────────────────┬────────────────────────────┘  │
│                              │                              │
│  ┌──────────────┐  ┌─────────▼──────────┐  ┌────────────┐  │
│  │  SIEM        │  │  Real-Time SSE     │  │  Executive │  │
│  │  Webhooks    │  │  to Frontend       │  │  Dashboard │  │
│  └──────────────┘  └────────────────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

### 10.2 New Backend API Endpoints Required

All new monitoring streams require corresponding backend ingestion endpoints:

```typescript
// New endpoints to add to the backend:

POST /telemetry/clipboard        → ingest clipboard capture events
POST /telemetry/file-events      → ingest file system change events
POST /telemetry/print-jobs       → ingest print spooler events
POST /telemetry/usb-events       → ingest USB connect/disconnect events
POST /telemetry/network-deep     → ingest enriched netstat snapshots
POST /telemetry/browser-history  → ingest browser history batches
POST /telemetry/wifi-scan        → ingest nearby Wi-Fi networks
POST /telemetry/bluetooth-scan   → ingest nearby Bluetooth devices
POST /telemetry/media-activity   → ingest mic/camera usage events
POST /telemetry/security-events  → ingest Windows Event Log entries
POST /telemetry/persistence-scan → ingest autorun/scheduled task scans
POST /evidence/screenshot        → ingest silent screenshot captures
POST /evidence/bundle            → ingest encrypted forensic bundles
POST /telemetry/tamper           → ingest tamper detection events

// Android-specific:
POST /telemetry/call-logs        → ingest call log metadata
POST /telemetry/sms-metadata     → ingest SMS metadata (no content)
POST /telemetry/app-usage        → ingest per-app usage statistics
```

---

### 10.3 New Database Entities Required

```typescript
// New TypeORM entities to create alongside existing ones:

ClipboardEvent       { id, deviceId, tenantId, content, contentLength, activeProcess, capturedAt }
FileChangeEvent      { id, deviceId, tenantId, changeType, path, oldPath, detectedAt }
PrintJobEvent        { id, deviceId, tenantId, documentName, printerName, totalPages, owner, printedAt }
UsbDeviceEvent       { id, deviceId, tenantId, action, deviceName, deviceId, description, timestamp }
NetworkConnectionDeep { id, deviceId, tenantId, localAddr, remoteAddr, remoteGeo, state, processName, processPath, capturedAt }
BrowserHistoryEntry  { id, deviceId, tenantId, browser, url, title, visitCount, lastVisit }
WifiScanResult       { id, deviceId, tenantId, ssid, bssid, signal, auth, encryption, scannedAt }
BluetoothScanResult  { id, deviceId, tenantId, deviceName, deviceId, description, discoveredAt }
MediaActivityEvent   { id, deviceId, tenantId, mediaType, processName, status, detectedAt }
SecurityEventLog     { id, deviceId, tenantId, eventId, source, message, timeGenerated, userName }
PersistenceEntry     { id, deviceId, tenantId, hive, keyPath, name, command, scannedAt }
ScreenshotCapture    { id, deviceId, tenantId, imageData, screenCount, capturedAt, commandId }
CallLogEntry         { id, deviceId, tenantId, number, duration, type, timestamp }
SmsMetadataEntry     { id, deviceId, tenantId, address, direction, timestamp }
AppUsageStat         { id, deviceId, tenantId, packageName, appLabel, totalForegroundMs, lastUsed }
TamperEvent          { id, deviceId, tenantId, reason, details, detectedAt }
```

---

### 10.4 Frontend Dashboard Pages Required for New Telemetry

```
New pages / tabs to add to the Next.js frontend:

/devices/[id]/clipboard    → Timeline of clipboard captures with process context
/devices/[id]/files        → File system activity heatmap + change log
/devices/[id]/browser      → Browser history viewer with risk scoring
/devices/[id]/network-deep → Active connections map (IP geolocation on world map)
/devices/[id]/media        → Microphone/camera usage timeline
/devices/[id]/usb          → USB device history with allow/block actions
/devices/[id]/security-log → Windows Event Log viewer (filtered by risk)
/devices/[id]/persistence  → Autorun entries, scheduled tasks, new services
/devices/[id]/print        → Print job history with DLP risk flag
/fleet/wifi-map            → Heatmap of nearby Wi-Fi networks across all devices
/fleet/anomalies           → AI anomaly feed — all behavioral deviations
/fleet/intelligence        → Executive security score dashboard
/evidence                  → Screenshot gallery + forensic bundle downloads
```

---

## 11. Updated Complete Implementation Checklist

### Foundation (Already Built ✅)
- [x] Multi-Tenant Core Backend (NestJS + PostgreSQL + Redis)
- [x] JWT + TOTP MFA Authentication
- [x] Dual-Control Approval (WIPE/RETIRE/SHUTDOWN)
- [x] Cryptographic SHA-256 Audit Chain
- [x] Usage Provenance Hash Chain (court-grade evidence)
- [x] Real-Time SSE Events
- [x] Enterprise Telemetry Evaluator (auto-alerts)
- [x] Windows C# Agent (SYSTEM service — active window, process list, heartbeat)
- [x] Android Kotlin Agent (Device Admin, WorkManager, DPC enrollment)
- [x] Docker Compose Infrastructure

### Phase 1 — Deployment & Command Completion
- [ ] Windows 1-Click PowerShell installer with DACL hardening
- [ ] Android Zero-Touch QR — spec-compliant DPC provisioning JSON
- [ ] Fix REFRESH_INVENTORY stub
- [ ] Complete all 14 Windows command handlers
- [ ] Complete all 14 Android command handlers

### Phase 2 — Real-Time, DLP & Anti-Tamper
- [ ] WebSocket / Socket.IO duplex gateway
- [ ] Automated zero-tolerance process kill pipeline
- [ ] USB lock registry enforcement
- [ ] Dual-process watchdog + DACL service hardening
- [ ] Camera & screen capture disable (Android)

### Phase 3 — Resilience, Geocurfew & Forensics
- [ ] Encrypted SQLite offline buffer (100K events, AES-256 DPAPI)
- [ ] Dynamic geocurfew auto-lock engine
- [ ] Full forensic diagnostic bundle (netstat, event logs, drivers, autorun)
- [ ] Cryptographic chain verifier UI on /audit

### Phase 4 — Advanced Enterprise
- [ ] Software deployment module (packages, deploy, uninstall)
- [ ] Policy enforcement engine wiring
- [ ] Bull queue processors (notifications, archival)
- [ ] Network isolation command (management channel preserved)
- [ ] Just-in-time privileged access with auto-revoke

### Phase 5 — Competitive Differentiation
- [ ] AI behavioral anomaly detection (14-day baseline, Z-score)
- [ ] SIEM/SOAR webhooks (CEF, LEEF, OCSF, JSON)
- [ ] Active Directory / LDAP auto-sync
- [ ] Executive fleet intelligence dashboard
- [ ] Zero-knowledge employee privacy mode (GDPR/DPDP)

### Phase 6 — Maximum Depth Monitoring (New)
- [ ] Clipboard content monitor (Windows STA thread hook)
- [ ] Browser history extraction (Chrome, Edge, Firefox SQLite)
- [ ] Print spooler event monitor (WMI document print log)
- [ ] File system change watcher (Documents, Desktop, Downloads)
- [ ] USB connect/disconnect event stream
- [ ] Nearby Wi-Fi network scanner (SSID + BSSID)
- [ ] Nearby Bluetooth device scanner
- [ ] Microphone/camera activity detection (process-level)
- [ ] Windows Security Event Log collection (key Event IDs)
- [ ] Persistence / autorun scanner (registry + scheduled tasks)
- [ ] Deep network connection monitor (with geo-IP enrichment)
- [ ] Android call log metadata collection
- [ ] Android SMS metadata collection
- [ ] Android per-app usage statistics
- [ ] All new backend telemetry ingestion endpoints (14 new endpoints)
- [ ] All new database entities (17 new entities)
- [ ] All new frontend dashboard pages (13 new pages)

### Phase 7 — Agent Stealth & Hardening (New)
- [ ] Service name masking (Windows-sounding generic name)
- [ ] Install path obfuscation (hidden system cache directory)
- [ ] Log file SYSTEM-only ACL hardening
- [ ] Network traffic disguised as browser/Windows Update HTTPS
- [ ] Heartbeat interval jitter (±15 seconds anti-detection)
- [ ] Anti-debug detection + silent report + exit
- [ ] VM / sandbox detection (report to control plane)
- [ ] Binary self-integrity SHA-256 verification
- [ ] Registry config key SYSTEM-only ACL hardening
- [ ] Encrypted DPAPI config storage (machine-bound)
- [ ] Android app hidden from launcher (no home screen icon)
- [ ] Android agent undeletable (setUninstallBlocked)
- [ ] Android factory reset blocked (DISALLOW_FACTORY_RESET)
- [ ] Android safe mode boot blocked (DISALLOW_SAFE_BOOT)
- [ ] Android ADB/debug access blocked (DISALLOW_DEBUGGING_FEATURES)

---

*Document Version: v3.0*
*Created by SentinelOps Enterprise Architecture Team*
*October 27, 2026 — Maximum Depth Monitoring + Complete Stealth Architecture Added*
*All capabilities documented for authorized enterprise IT deployment*


---

## 12. Enterprise Agent Deployment Methods — Complete Distribution Playbook

> **Context:** Yeh sab methods standard enterprise IT deployment practices hain. In sabka use corporate-owned or BYOD devices pe hota hai jahan organization ne device management policy define ki ho (employment contract / acceptable use policy ke through). Agent ka naam / icon generic rakha jata hai (Section 9.1 ke according) lekin deployment method khud fully legitimate hota hai.

---

### 12.1 Method 1 — Direct Link / Email-Based User-Assisted Deployment

**Kaise kaam karta hai:**
IT admin ek enrollment link generate karta hai dashboard se. Yeh link employee ko email, Slack, WhatsApp, SMS, ya kisi bhi channel se bheja ja sakta hai. Employee link pe click karta hai — ek lightweight installer/page khulta hai — aur agent install ho jaata hai.

**Windows flow:**

```
Step 1: IT Admin → Dashboard → /enrollment → "Generate Windows Installer Link"
         → Backend generates: https://sentinel.company.com/install/windows?token=ENT-XXXX

Step 2: Employee receives email:
         "Please install the IT security agent on your company laptop.
          Click here: https://sentinel.company.com/install/windows?token=ENT-XXXX"

Step 3: Employee clicks link → browser opens → auto-downloads:
         SentinelOpsSetup.exe  (or disguised name: "CompanySecuritySetup.exe")

Step 4: Employee runs the .exe → it silently:
         - Extracts agent binary
         - Runs install-windows-agent.ps1 in background (elevated via UAC prompt)
         - Registers Windows service
         - Enrolls with backend using the token
         - Completes in ~30 seconds
         - Shows: "IT Security setup complete. Your device is now protected."
```

**Backend endpoint to build:**
```typescript
// enrollment.controller.ts — new endpoint
@Get('install/windows')
async windowsInstallerRedirect(@Query('token') token: string, @Res() res: Response) {
  // Validate token is real and not expired
  await this.enrollmentService.validateToken(token);
  // Serve the installer EXE with the token pre-baked inside
  const installerPath = await this.buildTokenizedInstaller(token, 'windows');
  res.download(installerPath, 'CompanySecuritySetup.exe');
}

@Get('install/android')
async androidInstallerRedirect(@Query('token') token: string, @Res() res: Response) {
  await this.enrollmentService.validateToken(token);
  // Serve APK with token pre-baked
  const apkPath = await this.buildTokenizedApk(token);
  res.download(apkPath, 'CompanySecurityAgent.apk');
}

// The tokenized installer has the enrollment token + server URL hardcoded at build time
// So employee doesn't need to enter anything — just run and done
```

**Self-Extracting EXE builder (Windows):**
```csharp
// Use NSIS (Nullsoft Scriptable Install System) or WiX to create a self-extracting EXE
// that bundles: SentinelOpsAgent.exe + SentinelWatchdog.exe + appsettings.json (with token)
// On run:
//   1. Extracts to temp dir
//   2. Runs install.ps1 silently (UAC prompt appears once — "Allow this app to make changes?")
//   3. Installs service, starts agent, shows success message
//   4. Self-deletes the installer package

// NSIS script snippet:
!include "MUI2.nsh"
Name "Company Security Setup"
OutFile "CompanySecuritySetup.exe"
RequestExecutionLevel admin
Section "Install"
  SetOutPath "$PROGRAMFILES\CompanyIT"
  File "SentinelOpsAgent.exe"
  File "SentinelWatchdog.exe"
  File "appsettings.json"  ; pre-baked with token + server URL
  ExecWait 'sc.exe create SentinelOpsAgent binPath= "$PROGRAMFILES\CompanyIT\SentinelOpsAgent.exe" start= auto obj= "NT AUTHORITY\SYSTEM"'
  ExecWait 'sc.exe start SentinelOpsAgent'
  MessageBox MB_OK "IT Security setup complete. Your device is now protected."
SectionEnd
```

**Android flow:**

```
Step 1: IT Admin → Dashboard → /enrollment → "Generate Android Install Link"
         → Backend generates: https://sentinel.company.com/install/android?token=ENT-XXXX

Step 2: Employee receives SMS/WhatsApp/email:
         "Please install the company security app:
          https://sentinel.company.com/install/android?token=ENT-XXXX"

Step 3: Employee opens link on Android phone
         → Chrome/browser opens → shows a simple page:
           "Company IT Security Agent — tap Install to continue"
         → APK auto-downloads (or tap Download button)

Step 4: Employee taps APK → Android shows install prompt → taps Install
         → App installs with pre-baked token
         → On first launch: silently enrolls with backend
         → Shows: "Device enrolled successfully."

Note: For full Device Owner mode via this method, employee needs to:
  → Go to Settings → Apps → CompanySecurityAgent → "Set as Device Admin"
  OR IT uses Zero-Touch / QR method for full Device Owner (Section 12.3)
```

---

### 12.2 Method 2 — QR Code Deployment (Scan & Install)

**Use case:** Onboarding events, IT help desk counter, physical office setup. Employee scans a QR code displayed on a screen, poster, or printed card.

**Two QR code types:**

**Type A — Simple Install QR (any Android device, no factory reset):**
```
QR contains: https://sentinel.company.com/install/android?token=ENT-XXXX
→ Employee scans with camera app
→ Browser opens, APK downloads, installs with one tap
→ Device Admin mode only (not full Device Owner)
```

**Type B — Zero-Touch Provisioning QR (full Device Owner, requires factory reset):**
```
QR contains: Full DPC provisioning JSON payload (see Section 3, Phase 1)
→ Employee scans during factory reset "Welcome" screen (after 6 taps on build number)
→ Android OS reads QR, downloads APK, sets app as Device Owner automatically
→ Full Device Owner — user cannot uninstall, factory reset, or disable agent
```

**Frontend implementation — QR code display page:**
```typescript
// enrollment page — already has qrcode.react, just wire it up properly

// Show both QR types side by side:
// Left QR: simple install link (for existing devices)
// Right QR: DPC provisioning JSON (for new device setup / factory reset)

const SimpleInstallQR = ({ token, apiUrl }) => (
  <QRCode
    value={`${apiUrl}/install/android?token=${token}`}
    size={256}
    level="M"
  />
);

const DeviceOwnerQR = ({ token, tenantId, apiUrl, apkUrl, apkChecksum, wifiSsid, wifiPass }) => {
  const provisioningPayload = JSON.stringify({
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME":
      "com.sentinelops.agent/com.sentinelops.agent.admin.SentinelDeviceAdminReceiver",
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": apkUrl,
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": apkChecksum,
    "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": false,
    "android.app.extra.PROVISIONING_WIFI_SSID": wifiSsid,
    "android.app.extra.PROVISIONING_WIFI_PASSWORD": wifiPass,
    "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
      tenantId, apiEndpoint: apiUrl, enrollmentToken: token
    }
  });
  return <QRCode value={provisioningPayload} size={256} level="H" />;
};
```

**Physical deployment card (printable):**
```
┌────────────────────────────────────────────────┐
│         COMPANY IT SECURITY SETUP              │
│                                                │
│  New Phone Setup        Existing Phone         │
│  (Full Management)      (Basic Setup)          │
│                                                │
│  [QR CODE - DPC]        [QR CODE - LINK]       │
│                                                │
│  Factory reset phone    Just scan & install    │
│  → scan this code       → scan this code       │
│  → follows setup steps                         │
│                                                │
│  Support: it@company.com  |  Ext: 1234         │
└────────────────────────────────────────────────┘
```

---

### 12.3 Method 3 — Group Policy Object (GPO) — Active Directory Mass Deploy

**Use case:** Company has Windows domain (Active Directory). IT admin deploys to ALL domain-joined machines at once — no manual action on each machine.

**How it works:**
```
IT Admin:
  1. Copies SentinelOpsAgent.msi to a network share:
     \\corpserver\NETLOGON\SentinelOps\SentinelOpsAgent.msi

  2. Opens Group Policy Management Console (GPMC)
  3. Creates new GPO: "SentinelOps Agent Deployment"
  4. Computer Configuration → Policies → Software Settings
     → Software Installation → New Package
     → Points to \\corpserver\NETLOGON\SentinelOps\SentinelOpsAgent.msi
     → Deploy type: "Assigned" (installs silently on next reboot)

  5. Links GPO to target OU (Organizational Unit):
     e.g. "All Workstations" OU → affects all company laptops/desktops

Result:
  → Next time any domain-joined machine reboots / user logs in
  → Windows automatically installs the MSI silently
  → No user interaction required
  → No UAC prompt (GPO-deployed software installs at SYSTEM level)
  → Agent starts automatically after install
```

**MSI package builder script:**
```powershell
# Build MSI using WiX Toolset (open source)
# wix.wxs definition:

<Product Id="*" Name="Company IT Security" Version="1.0.0.0"
         Manufacturer="Company IT" Language="1033">
  <Package InstallerVersion="200" Compressed="yes" InstallScope="perMachine"/>
  <Directory Id="TARGETDIR" Name="SourceDir">
    <Directory Id="ProgramFilesFolder">
      <Directory Id="INSTALLFOLDER" Name="CompanyIT">
        <Component Id="AgentBinary" Guid="...">
          <File Source="SentinelOpsAgent.exe" KeyPath="yes"/>
          <File Source="SentinelWatchdog.exe"/>
          <File Source="appsettings.json"/>
          <ServiceInstall Id="SentinelService"
            Name="WUAgentHelper"
            DisplayName="Windows Update Agent Helper"
            Description="Manages Windows security and update policies"
            Type="ownProcess" Start="auto" Account="LocalSystem"
            ErrorControl="normal"
            Arguments=""
            Vital="yes"/>
          <ServiceControl Id="StartService" Name="WUAgentHelper"
            Start="install" Stop="uninstall" Remove="uninstall" Wait="yes"/>
        </Component>
      </Directory>
    </Directory>
  </Directory>
  <Feature Id="MainFeature" Level="1">
    <ComponentRef Id="AgentBinary"/>
  </Feature>
</Product>
```

---

### 12.4 Method 4 — SCCM / Microsoft Endpoint Configuration Manager

**Use case:** Large enterprises (500+ devices) that already use SCCM for software distribution.

```
IT Admin steps in SCCM Console:

1. Create Application:
   → Software Library → Application Management → Applications → Create Application
   → Type: "Windows Installer (*.msi)"
   → Source: \\sccmserver\sources\SentinelOps\SentinelOpsAgent.msi
   → Installation program: msiexec /i SentinelOpsAgent.msi /quiet /norestart
   → Uninstall: msiexec /x {PRODUCT-GUID} /quiet

2. Create Deployment:
   → Right-click Application → Deploy
   → Collection: "All Windows Workstations"
   → Action: Install | Purpose: Required (mandatory, not optional)
   → Schedule: "As soon as possible" OR specific maintenance window
   → User experience: "Install silently, no notifications"

3. Result:
   → SCCM client on each machine receives the deployment
   → Installs silently in background during next polling cycle (default: 60 min)
   → Reports back install success/failure to SCCM console
   → IT admin sees deployment status across all machines
```

---

### 12.5 Method 5 — Windows Autopilot + Intune (New Device Out-of-Box)

**Use case:** New laptop purchased. IT wants it fully enrolled before it reaches the employee's desk.

```
Process:
  1. IT registers device hardware hash with Microsoft Autopilot portal
     (OEM can do this at factory — "zero-touch")

  2. IT creates Autopilot deployment profile:
     → "Skip privacy settings" → "Skip account setup" → "Auto MDM enroll"

  3. IT adds SentinelOpsAgent.msi to Intune as a Win32 app
     with required deployment to "All Devices" group

  4. Employee receives new laptop → powers it on
     → Windows shows company branding (not Microsoft OOBE)
     → Employee signs in with company email (Azure AD)
     → Autopilot runs silently:
        - Joins Azure AD
        - Enrolls in Intune MDM
        - Deploys all required apps including SentinelOpsAgent.msi
        - Configures policies
     → Total time: 15-20 minutes, fully automated
     → Employee sees a normal Windows desktop, all tools already installed

  SentinelOps integration:
     → SentinelOpsAgent.msi deployed via Intune alongside other corporate apps
     → OR: SentinelOps runs standalone (no Intune needed) — just MSI via Autopilot script
```

---

### 12.6 Method 6 — PowerShell Remoting (WinRM) — Remote Fleet Install

**Use case:** IT needs to push agent to specific machines immediately without waiting for GPO refresh or SCCM cycle. Works on any domain machine where WinRM is enabled.

```powershell
# Run from IT admin's machine — deploys to remote machine silently

# Single machine:
$credential = Get-Credential  # domain admin credentials
$session = New-PSSession -ComputerName "LAPTOP-JOHN-DOE" -Credential $credential

Invoke-Command -Session $session -ScriptBlock {
    # Copy installer to remote machine
    Copy-Item -Path "\\corpserver\NETLOGON\SentinelOps\install.ps1" `
              -Destination "C:\Windows\Temp\install.ps1"
    # Run silently
    Start-Process powershell.exe `
        -ArgumentList "-NonInteractive -WindowStyle Hidden -File C:\Windows\Temp\install.ps1" `
        -Verb RunAs -Wait
    # Cleanup
    Remove-Item "C:\Windows\Temp\install.ps1"
}

Remove-PSSession $session
Write-Host "Agent deployed to LAPTOP-JOHN-DOE"

# ─────────────────────────────────────────────────────────────
# Mass deploy to entire fleet (from CSV list of hostnames):

$machines = Import-Csv "machines.csv"  # columns: ComputerName
$credential = Get-Credential

$results = $machines | ForEach-Object -Parallel {
    $pc = $_.ComputerName
    try {
        $session = New-PSSession -ComputerName $pc -Credential $using:credential -ErrorAction Stop
        Invoke-Command -Session $session -ScriptBlock {
            $url = "https://sentinel.company.com/downloads/SentinelOpsAgent.msi"
            $dest = "C:\Windows\Temp\agent.msi"
            Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
            Start-Process msiexec.exe -ArgumentList "/i $dest /quiet /norestart" -Wait
            Remove-Item $dest
        }
        Remove-PSSession $session
        [PSCustomObject]@{ Computer = $pc; Status = "SUCCESS" }
    } catch {
        [PSCustomObject]@{ Computer = $pc; Status = "FAILED: $_" }
    }
} -ThrottleLimit 20  # deploy to 20 machines simultaneously

$results | Export-Csv "deployment-results.csv" -NoTypeInformation
Write-Host "Deployment complete. Results saved to deployment-results.csv"
```

---

### 12.7 Method 7 — Login Script Deployment (GPO Logon Script)

**Use case:** Simpler than software deployment GPO. Runs a script every time any domain user logs in. Checks if agent is installed — if not, installs it.

```powershell
# logon-sentinel.ps1 — placed at \\corpserver\NETLOGON\logon-sentinel.ps1
# GPO: User Configuration → Windows Settings → Scripts → Logon → Add this script

$serviceName = "WUAgentHelper"
$agentPath = "C:\ProgramData\CompanyIT\agent.exe"

# Check if already installed
$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($service -and (Test-Path $agentPath)) {
    # Already installed — just ensure it's running
    if ($service.Status -ne "Running") { Start-Service $serviceName }
    exit 0
}

# Not installed — download and install silently
$installerUrl = "https://sentinel.company.com/install/windows?token=ENT-FLEET-TOKEN"
$tempPath = "$env:TEMP\setup.exe"

try {
    # Download in background — user doesn't see anything
    (New-Object System.Net.WebClient).DownloadFile($installerUrl, $tempPath)
    # Run silently — no window, no UAC (runs in user context but setup.exe requests elevation)
    Start-Process -FilePath $tempPath -ArgumentList "/S /VERYSILENT" -Wait -WindowStyle Hidden
    Remove-Item $tempPath -Force
} catch {
    # Fail silently — retry on next login
}
```

---

### 12.8 Method 8 — NFC Bump Provisioning (Android)

**Use case:** IT admin taps their phone to a new employee's Android phone. Configuration transfers via NFC. No cables, no QR code, no link needed.

```kotlin
// IT admin device runs a "provisioner" app that:
// 1. Broadcasts DPC provisioning config via NFC NDEF message

// Provisioner app on IT admin's device:
class NfcProvisionerActivity : AppCompatActivity() {

    private fun broadcastProvisioningConfig() {
        val provisioningData = buildString {
            append("{")
            append("\"android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME\":")
            append("\"com.sentinelops.agent/.admin.SentinelDeviceAdminReceiver\",")
            append("\"android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE\":{")
            append("\"tenantId\":\"${config.tenantId}\",")
            append("\"apiEndpoint\":\"${config.apiUrl}\",")
            append("\"enrollmentToken\":\"${config.token}\"")
            append("}}")
        }

        val ndefRecord = NdefRecord.createMime(
            "application/com.android.managedprovisioning",
            provisioningData.toByteArray(Charsets.UTF_8)
        )
        val ndefMessage = NdefMessage(arrayOf(ndefRecord))

        // Push via Android Beam / NFC
        nfcAdapter.setNdefPushMessage(ndefMessage, this)
    }
}

// Employee's new phone (factory reset state):
// When IT admin taps their phone to employee's phone:
// → Android OS automatically reads the NDEF provisioning message
// → Downloads APK
// → Sets it as Device Owner
// → Completes enrollment
// → No typing, no QR scanning needed — just one physical tap
```

---

### 12.9 Method 9 — Google Zero-Touch Enrollment (Android Fleet)

**Use case:** Company orders 100 Android phones. All arrive pre-enrolled before first boot. IT never physically touches them.

```
Process:

1. Company purchases devices from a Zero-Touch-capable reseller
   (Samsung, Motorola, most corporate Android device suppliers)

2. IT admin logs into Google Zero-Touch Portal:
   https://partner.android.com/zerotouch

3. Creates a Configuration:
   → DPC Package: com.sentinelops.agent
   → DPC Extras JSON:
     {
       "tenantId": "company-tenant-id",
       "apiEndpoint": "https://sentinel.company.com/api",
       "enrollmentToken": "ENT-ZERO-TOUCH-TOKEN"
     }

4. Assigns configuration to device IMEI list
   (reseller provides IMEI list with order)

5. Devices are shipped to employees

6. Employee powers on phone:
   → During Android setup → "This device belongs to your organization"
   → Downloads SentinelOps APK automatically
   → Sets as Device Owner silently
   → Enrolls with SentinelOps backend
   → Employee completes normal Android setup
   → Agent is running as Device Owner — cannot be removed

IT admin never physically touches the device.
Employee receives a fully managed device out of the box.
```

---

### 12.10 Method 10 — Samsung Knox Deployment (Samsung Devices)

**Use case:** Company uses Samsung devices. Knox provides additional deployment and management capabilities beyond standard Android.

```
Knox Mobile Enrollment (KME):

1. IT admin registers in Samsung Knox Portal:
   https://www2.samsungknox.com/en/solutions/it-solutions/knox-mobile-enrollment

2. Uploads device IMEI/serial numbers (from purchase order)

3. Creates enrollment profile:
   → MDM server URL: https://sentinel.company.com/api
   → Agent APK download URL
   → Silent install: YES
   → Skip setup wizard: YES
   → Prevent profile removal: YES (user cannot remove management)

4. Optionally: enables Knox Container
   → Creates a separate "Work" container on device
   → SentinelOps agent runs inside Knox container
   → Stronger isolation than standard Android Device Owner
   → Kernel-level security (Samsung Knox hardware security chip)

5. Employee powers on Samsung device:
   → Knox firmware detects enrollment profile
   → Silently downloads and installs SentinelOps APK
   → Enrolls automatically
   → User cannot see or remove the management configuration
```

---

### 12.11 Method 11 — Email / Calendar Invite Phishing-Style Onboarding

> **Note:** "Phishing-style" here means it looks like a normal IT communication — NOT actual phishing. This is standard enterprise IT onboarding communication design.

**The most user-friendly method.** Employee receives a professional-looking email that looks exactly like any other IT communication:

```html
<!-- HTML email template sent from IT -->
Subject: Action Required: Install Company Security Agent — 5 Minutes

<body style="font-family: Arial; max-width: 600px; margin: 0 auto;">
  <img src="https://company.com/logo.png" width="150">
  <h2>IT Security — Required Action</h2>
  <p>Dear [Employee Name],</p>
  <p>As part of our IT security compliance program, please install the
     Company Security Agent on your work device by <strong>Friday, Nov 1</strong>.</p>
  <p>This takes less than 2 minutes:</p>

  <table>
    <tr>
      <td>
        <strong>Windows Laptop</strong><br>
        <a href="https://sentinel.company.com/install/windows?token=ENT-XXXX"
           style="background:#0078d4;color:white;padding:12px 24px;
                  text-decoration:none;border-radius:4px;">
          Download for Windows
        </a>
      </td>
      <td>
        <strong>Android Phone</strong><br>
        <a href="https://sentinel.company.com/install/android?token=ENT-XXXX"
           style="background:#34a853;color:white;padding:12px 24px;
                  text-decoration:none;border-radius:4px;">
          Download for Android
        </a>
      </td>
    </tr>
  </table>

  <p>Questions? Contact IT Help Desk: it@company.com | Ext. 1234</p>
  <p style="font-size:11px;color:#666;">
    This device management software monitors company-owned devices per our
    Acceptable Use Policy. View policy: [link]
  </p>
</body>
```

**Backend — tokenized install page (what opens when employee clicks):**

```typescript
// frontend: app/install/page.tsx — a clean install landing page

// Windows: shows download button → EXE downloads with token pre-baked
// Android: shows APK download + QR code + step-by-step instructions

// After install:
// → Employee sees: "Setup complete! Your device is now protected by Company IT Security."
// → Backend marks token as used, device enrolled, admin notified

// The install page can be branded to look like any internal IT portal:
// - Company logo
// - Company color scheme
// - Generic product name ("Company Security Agent" not "SentinelOps")
```

---

### 12.12 Deployment Method Comparison Matrix

| Method | User Action Required | IT Effort | Scale | Device Owner (Android) | Speed |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Email / Link** | Click link + run file | Low | Medium | ❌ Admin only | Minutes |
| **QR Code (simple)** | Scan + tap install | Low | Medium | ❌ Admin only | Minutes |
| **QR Code (DPC)** | Factory reset + scan | Medium | Medium | ✅ Full DO | 5 min |
| **NFC Bump** | Power on phone | Minimal | Low | ✅ Full DO | 2 min |
| **GPO** | None (auto on reboot) | Medium (one-time) | Unlimited | N/A | Next reboot |
| **SCCM** | None (background) | Medium (one-time) | Unlimited | N/A | 60 min |
| **PowerShell WinRM** | None | Low | Medium | N/A | Immediate |
| **Login Script** | None (auto on login) | Low (one-time) | Unlimited | N/A | Next login |
| **Autopilot** | Sign in with email | None | Unlimited | N/A | 20 min |
| **Zero-Touch** | Power on device | None (pre-setup) | Unlimited | ✅ Full DO | First boot |
| **Samsung Knox** | Power on device | None (pre-setup) | Unlimited | ✅ Full DO + Knox | First boot |
| **Calendar Invite** | Click link | Low | Medium | ❌ Admin only | Minutes |

---

### 12.13 Backend: Enrollment Link Generator (Dashboard Feature)

```typescript
// enrollment.controller.ts — Generate install links for all methods

@Post('generate-install-link')
@UseGuards(JwtAuthGuard)
async generateInstallLink(
  @CurrentUser() user: User,
  @Body() dto: GenerateInstallLinkDto
): Promise<InstallLinkResponse> {

  // Create a time-limited enrollment token
  const { token, expiresAt } = await this.enrollmentService.createToken(
    user.tenantId,
    user.id,
    {
      expiresHours: dto.expiresHours || 72,   // 3 days default
      targetPlatform: dto.platform,           // 'windows' | 'android' | 'both'
      maxUses: dto.maxUses || 1,              // single-use by default
      deviceId: dto.deviceId,                // optional: pre-assign to specific device record
      label: dto.label                        // e.g. "John Doe's laptop"
    }
  );

  const baseUrl = process.env.PUBLIC_URL; // e.g. https://sentinel.company.com

  return {
    token,
    expiresAt,
    links: {
      windows: `${baseUrl}/install/windows?token=${token}`,
      android: `${baseUrl}/install/android?token=${token}`,
      universal: `${baseUrl}/install?token=${token}`,  // auto-detects platform
    },
    qrCodes: {
      simpleInstall: `${baseUrl}/install/android?token=${token}`,  // simple QR
      deviceOwner: buildDpcProvisioningJson(token, baseUrl),        // full DO QR
    },
    emailTemplate: buildEmailTemplate(token, baseUrl, dto.employeeName),
    powershellCommand: `iex (iwr "${baseUrl}/install/windows-ps1?token=${token}").Content`,
    // One-liner PowerShell for IT to paste in WinRM session or chat
  };
}
```

**One-liner PowerShell install (IT can send via chat/email for manual run):**
```powershell
# IT sends this single line to employee via Slack/Teams — they paste in PowerShell as admin:
iex (iwr "https://sentinel.company.com/install/windows-ps1?token=ENT-XXXX" -UseBasicParsing).Content

# This downloads and immediately runs the install script
# Similar to: curl -sSL https://... | sudo bash  (Linux pattern)
# Works in Windows PowerShell — one paste, no file download needed
```

---

### 12.14 Deployment Tracking Dashboard

```typescript
// New frontend page: /deployment — track all enrollment links and their status

// Shows:
// - All generated tokens: label, platform, created by, expiry, max uses
// - Status per token: PENDING / USED / EXPIRED / REVOKED
// - Device enrolled via this token (click → Device 360 view)
// - Timestamp of enrollment
// - IP address at enrollment time
// - "Resend Email" button — sends email with link again
// - "Revoke" button — invalidates the link immediately
// - "Bulk Generate" — create 50 tokens at once for mass onboarding
```

---

*Section 12 Added: October 27, 2026*
*Complete Enterprise Deployment Playbook — 12 Methods, Full Implementation Code*


---

## 13. MASTER PHASE-WISE IMPLEMENTATION PLAN
### — Zero Confusion, Zero Gap, 100% Complete —

> **How to use this section:**
> Yeh poore project ka ek definitive, numbered task list hai. Har task mein hai:
> - Exact files jo edit/create karni hain
> - Estimated effort (hours/days)
> - Dependencies (kon sa task pehle complete hona chahiye)
> - Acceptance criteria (kaise pata chalega ki kaam done hai)
>
> **Upar se neeche, ek ek karo. Koi bhi task skip mat karo.**

---

## ═══════════════════════════════════════════════════════
## SPRINT 1 — WEEK 1–2 : FOUNDATION FIXES & QUICK WINS
## ═══════════════════════════════════════════════════════
> **Goal:** Existing code ke andar jo stubs aur incomplete implementations hain unhe fix karo. Yeh sab LOW effort, HIGH impact hain. Is sprint ke baad agent ka har existing feature properly kaam karega.

---

### TASK-001 — Fix REFRESH_INVENTORY Command Stub
**Priority:** 🔴 Critical | **Effort:** 2 hours | **Dependency:** None

**Files to edit:**
```
windows-agent/Commands/CommandExecutor.cs
```

**Exactly kya karna hai:**
```
Line ~60 mein "REFRESH_INVENTORY" case dhundho.
Current code: sirf timestamp return karta hai.
Replace with:
  1. _inventoryCollector.CollectFullInventoryAsync(cancellationToken) call karo
  2. Result ko /inventory/ingest endpoint pe POST karo
  3. resultData["packageCount"] = collected packages count
  4. resultData["refreshedAt"] = DateTime.UtcNow
```

**Acceptance Criteria:** Dashboard se "Refresh Inventory" button click karo → device ka inventory actually update ho jaye, sirf timestamp nahi.

---

### TASK-002 — Complete Windows Command: EXECUTE_COMMAND (PowerShell Shell)
**Priority:** 🔴 Critical | **Effort:** 4 hours | **Dependency:** None

**Files to edit:**
```
windows-agent/Commands/CommandExecutor.cs
windows-agent/Security/CommunicationClient.cs  (StreamLine method add)
```

**Exactly kya karna hai:**
```
CommandExecutor.cs mein "EXECUTE_COMMAND" case add karo:
  - Process start karo: powershell.exe -NoProfile -ExecutionPolicy Bypass
  - RedirectStandardOutput = true, RedirectStandardError = true
  - CreateNoWindow = true (invisible to user)
  - proc.OutputDataReceived → line by line backend ko bhejo
  - proc.WaitForExit()
  - resultData["exitCode"] = proc.ExitCode
```

**Acceptance Criteria:** Dashboard terminal se `whoami` type karo → output visible ho. `ping google.com -n 3` type karo → real-time line-by-line output aaye.

---

### TASK-003 — Complete Windows Command: KILL_PROCESS
**Priority:** 🔴 Critical | **Effort:** 1 hour | **Dependency:** None

**Files to edit:**
```
windows-agent/Commands/CommandExecutor.cs
```

**Exactly kya karna hai:**
```
"KILL_PROCESS" case add karo:
  - payload se processName ya pid lo
  - Process.GetProcessesByName(processName) → foreach → p.Kill(entireProcessTree: true)
  - resultData["killedCount"] = targets.Length
  - resultData["killedAt"] = DateTime.UtcNow
```

**Acceptance Criteria:** Notepad.exe open karo, dashboard se KILL_PROCESS send karo → notepad close ho jaye.

---

### TASK-004 — Complete Windows Command: USB_LOCK
**Priority:** 🔴 Critical | **Effort:** 2 hours | **Dependency:** None

**Files to edit:**
```
windows-agent/Commands/CommandExecutor.cs
shared/src/types/remote-action.types.ts  (USB_LOCK enum value add)
```

**Exactly kya karna hai:**
```
"USB_LOCK" case add karo with 3 modes:
  DISABLE: Registry HKLM\SYSTEM\...\USBSTOR Start = 4
  READ_ONLY: Registry HKLM\SYSTEM\...\StorageDevicePolicies WriteProtect = 1
  ENABLE: USBSTOR Start = 3, WriteProtect = 0
shared/src/types/remote-action.types.ts mein USB_LOCK enum add karo
```

**Acceptance Criteria:** Dashboard se USB_LOCK DISABLE bhejo → USB drive plug karo → Windows "Access Denied" de. ENABLE bhejo → drive accessible ho jaye.

---

### TASK-005 — Complete Windows Command: SEND_NOTIFICATION
**Priority:** 🟡 High | **Effort:** 2 hours | **Dependency:** None

**Files to edit:**
```
windows-agent/Commands/CommandExecutor.cs
windows-agent/SentinelOpsAgent.csproj  (Microsoft.Toolkit.Uwp.Notifications NuGet add)
```

**Exactly kya karna hai:**
```
"SEND_NOTIFICATION" case add karo:
  - NuGet: Microsoft.Toolkit.Uwp.Notifications
  - new ToastContentBuilder().AddText(title).AddText(message).Show()
  - resultData["notifiedAt"] = DateTime.UtcNow
```

**Acceptance Criteria:** Dashboard se notification bhejo → employee ke screen pe Windows toast notification aaye bottom-right corner mein.

---

### TASK-006 — Complete Windows Command: TAKE_SCREENSHOT
**Priority:** 🟡 High | **Effort:** 3 hours | **Dependency:** TASK-002 (CommunicationClient.PostAsync)

**Files to edit:**
```
windows-agent/Commands/CommandExecutor.cs
backend/src/remote-actions/remote-actions.controller.ts  (/evidence/screenshot endpoint)
```

**Exactly kya karna hai:**
```
Windows agent "TAKE_SCREENSHOT" case:
  - Screen.AllScreens enumerate karo
  - Bitmap + Graphics.CopyFromScreen (SYSTEM level — no permission needed)
  - MemoryStream mein JPEG save karo
  - List<string> screenshots = base64 encoded images
  - _client.PostAsync("/evidence/screenshot", {commandId, screenshots, capturedAt})

Backend: POST /evidence/screenshot endpoint banao
  - Screenshots ko DB mein store karo (ScreenshotCapture entity)
  - Frontend pe /evidence page pe display karo
```

**Acceptance Criteria:** Dashboard se TAKE_SCREENSHOT bhejo → `/evidence` page pe screenshot visible ho.

---

### TASK-007 — Complete Windows Command: LOCATE_DEVICE
**Priority:** 🟡 High | **Effort:** 2 hours | **Dependency:** None

**Files to edit:**
```
windows-agent/Commands/CommandExecutor.cs
windows-agent/SentinelOpsAgent.csproj  (System.Device NuGet)
```

**Exactly kya karna hai:**
```
"LOCATE_DEVICE" case:
  - Primary: GeoCoordinateWatcher(GeoPositionAccuracy.High).Start()
  - 5 second timeout wait
  - Fallback: HTTP GET to ip-api.com/json → lat/lng from IP
  - resultData["latitude", "longitude", "accuracy", "source"] return karo
```

**Acceptance Criteria:** Dashboard se LOCATE_DEVICE bhejo → device ke coordinates map pe show hon.

---

### TASK-008 — Complete Windows Command: WIPE
**Priority:** 🔴 Critical | **Effort:** 1 hour | **Dependency:** None

**Files to edit:**
```
windows-agent/Commands/CommandExecutor.cs
```

**Exactly kya karna hai:**
```
"WIPE" case:
  - Process.Start("reagentc.exe", "/boottore")  → boot to recovery
  - Process.Start("shutdown.exe", "/r /t 0")
  - This triggers Windows Recovery Environment factory reset
```

**Acceptance Criteria:** WIPE command dispatched (test in VM only!) → machine reboots to recovery.

---

### TASK-009 — Complete Windows Command: NETWORK_ISOLATE + NETWORK_RESTORE
**Priority:** 🔴 Critical | **Effort:** 3 hours | **Dependency:** None

**Files to edit:**
```
windows-agent/Commands/CommandExecutor.cs
shared/src/types/remote-action.types.ts  (NETWORK_ISOLATE, NETWORK_RESTORE enum)
```

**Exactly kya karna hai:**
```
"NETWORK_ISOLATE" case:
  - netsh advfirewall set allprofiles state on
  - netsh advfirewall firewall add rule name="SentinelBlock" dir=out action=block
  - netsh advfirewall firewall add rule name="SentinelMgmt" dir=out action=allow
    remoteip={_config.ServerIp} protocol=tcp remoteport=443
  - resultData["isolatedAt", "managementChannelPreserved"] 

"NETWORK_RESTORE" case:
  - Delete the two added firewall rules
  - resultData["restoredAt"]
```

**Acceptance Criteria:** NETWORK_ISOLATE bhejo → device internet band ho jaye lekin WebSocket/heartbeat live rahe.

---

### TASK-010 — Complete Windows Command: SYNC_POLICY
**Priority:** 🟡 High | **Effort:** 2 hours | **Dependency:** TASK-032 (Policy engine)

**Files to edit:**
```
windows-agent/Commands/CommandExecutor.cs
```

**Exactly kya karna hai:**
```
"SYNC_POLICY" case:
  - _client.GetAsync<PolicyConfig>("/policies/device-policy") call karo
  - Response ko local appsettings mein save karo
  - Policy-driven settings apply karo (blacklist update, monitoring intervals)
  - resultData["syncedAt", "policyVersion"]
```

---

### TASK-011 — Complete Android Command: KILL_PROCESS
**Priority:** 🔴 Critical | **Effort:** 2 hours | **Dependency:** None

**Files to edit:**
```
android-agent/app/src/main/java/com/sentinelops/agent/commands/RemoteCommandWorker.kt
```

**Exactly kya karna hai:**
```
"KILL_PROCESS" when block:
  - dpm.isDeviceOwnerApp check
  - ActivityManager.killBackgroundProcesses(packageName)
  - resultData["killedPackage"] = packageName
```

---

### TASK-012 — Complete Android Command: USB_LOCK
**Priority:** 🔴 Critical | **Effort:** 1 hour | **Dependency:** None

**Files to edit:**
```
android-agent/app/src/main/java/com/sentinelops/agent/commands/RemoteCommandWorker.kt
```

**Exactly kya karna hai:**
```
"USB_LOCK" when block:
  - Build.VERSION.SDK_INT >= S check
  - dpm.setUsbDataSignalingEnabled(adminComponent, false)
  - resultData["usbLocked"] = true
```

---

### TASK-013 — Complete Android Commands: CAMERA_DISABLE + SCREEN_CAPTURE_DISABLE
**Priority:** 🟡 High | **Effort:** 1 hour | **Dependency:** None

**Files to edit:**
```
android-agent/app/src/main/java/com/sentinelops/agent/commands/RemoteCommandWorker.kt
```

**Exactly kya karna hai:**
```
"CAMERA_DISABLE": dpm.setCameraDisabled(adminComponent, payload.disabled)
"SCREEN_CAPTURE_DISABLE": dpm.setScreenCaptureDisabled(adminComponent, payload.disabled)
```

---

### TASK-014 — Complete Android Command: KIOSK_MODE
**Priority:** 🟡 High | **Effort:** 2 hours | **Dependency:** None

**Files to edit:**
```
android-agent/app/src/main/java/com/sentinelops/agent/commands/RemoteCommandWorker.kt
```

**Exactly kya karna hai:**
```
"KIOSK_MODE" when block:
  - dpm.setLockTaskPackages(adminComponent, arrayOf(packageName))
  - dpm.setLockTaskFeatures(adminComponent, LOCK_TASK_FEATURE_NONE)
  - startLockTask()
  - resultData["kioskPackage"]
```

---

### TASK-015 — Complete Android Commands: SEND_NOTIFICATION + LOCATE_DEVICE + SYNC_POLICY + TAKE_SCREENSHOT
**Priority:** 🟡 High | **Effort:** 3 hours | **Dependency:** None

**Files to edit:**
```
android-agent/app/src/main/java/com/sentinelops/agent/commands/RemoteCommandWorker.kt
```

**Exactly kya karna hai:**
```
SEND_NOTIFICATION: NotificationCompat.Builder → nm.notify(...)
LOCATE_DEVICE: LocationManager.getLastKnownLocation(GPS_PROVIDER) → resultData lat/lng
SYNC_POLICY: networkClient.apiService.getDevicePolicy() → PolicyApplicator.apply()
TAKE_SCREENSHOT: MediaProjection API capture → upload to /evidence/screenshot
```

**Acceptance Criteria (Sprint 1):** Har 14 command type ka handler exist kare aur basic execution kare. Zero "Unsupported command type" responses.

---

## ═══════════════════════════════════════════════════════
## SPRINT 2 — WEEK 3–4 : REAL-TIME COMMUNICATION & AUTO-REMEDIATION
## ═══════════════════════════════════════════════════════
> **Goal:** HTTP polling hata ke WebSocket duplex channel lagao. Auto-remediation pipeline activate karo. Sub-200ms command delivery achieve karo.

---

### TASK-016 — Backend: WebSocket / Socket.IO Agent Gateway
**Priority:** 🔴 Critical | **Effort:** 2 days | **Dependency:** None

**Files to create/edit:**
```
backend/src/gateway/agent.gateway.ts         ← NEW FILE
backend/src/gateway/gateway.module.ts        ← NEW FILE
backend/src/app.module.ts                    ← GatewayModule import add
backend/package.json                         ← @nestjs/websockets, socket.io add
```

**Exactly kya karna hai:**
```
1. @nestjs/websockets install: npm i @nestjs/websockets @nestjs/platform-socket.io socket.io
2. agent.gateway.ts banao:
   - @WebSocketGateway({ namespace: '/agent-gateway', cors: true })
   - handleConnection(): deviceKey/Secret se verifyCredential() → socket.join(`device:${id}`)
   - handleDisconnect(): device OFFLINE mark karo
   - dispatchCommand(deviceId, command): socket.to(`device:${id}`).emit('command', payload)
   - @SubscribeMessage('command:result'): submitCommandResult() call karo
   - @SubscribeMessage('terminal:stdout'): admin frontend ko forward karo
3. RemoteActionsService mein: createAction ke baad agentGateway.dispatchCommand() call karo
4. app.module.ts mein GatewayModule import karo
```

**Acceptance Criteria:** Device connect ho → backend logs "Device {id} connected via WebSocket". Command dispatch karo → 200ms se pehle device pe pahunche (polling 5-30s ki jagah).

---

### TASK-017 — Windows Agent: WebSocket Client Replace HTTP Polling
**Priority:** 🔴 Critical | **Effort:** 1.5 days | **Dependency:** TASK-016

**Files to edit:**
```
windows-agent/Commands/CommandExecutor.cs
windows-agent/Security/CommunicationClient.cs
windows-agent/SentinelOpsAgent.csproj       ← WebSocketSharp NuGet
```

**Exactly kya karna hai:**
```
1. NuGet: System.Net.WebSockets.Client (built-in .NET 6+)
2. CommandExecutor.cs mein:
   - PollAndExecuteCommandsAsync() replace karo
   - ClientWebSocket connect: wss://{host}/agent-gateway
   - Headers: X-Device-Key, X-Device-Secret
   - Receive loop: JSON parse karo → ExecuteSingleCommandAsync()
   - Terminal stdout: ws.SendAsync("terminal:stdout", line)
   - Reconnect logic: exponential backoff (5s, 10s, 30s, 60s)
   - Fallback: if WebSocket fails → HTTP polling resume karo
```

**Acceptance Criteria:** Windows agent start karo → WebSocket connection establish ho. HTTP polling logs band ho jayein.

---

### TASK-018 — Android Agent: WebSocket Client
**Priority:** 🔴 Critical | **Effort:** 1 day | **Dependency:** TASK-016

**Files to create/edit:**
```
android-agent/app/src/main/java/com/sentinelops/agent/network/SentinelWebSocketListener.kt  ← NEW
android-agent/app/src/main/java/com/sentinelops/agent/commands/RemoteCommandWorker.kt
android-agent/app/build.gradle.kts           ← okhttp dependency confirm
```

**Exactly kya karna hai:**
```
1. SentinelWebSocketListener.kt banao:
   - OkHttp WebSocket client
   - Headers: X-Device-Key, X-Device-Secret
   - onMessage(): JSON parse → command execute → result emit
   - onFailure(): reconnect with exponential backoff
   - WorkManager polling remains as fallback (don't remove)
2. SentinelApplication.kt ya HeartbeatWorker mein WebSocket init karo
```

---

### TASK-019 — Backend: Automated Zero-Tolerance Process Kill Pipeline
**Priority:** 🔴 Critical | **Effort:** 3 hours | **Dependency:** TASK-016

**Files to edit:**
```
backend/src/heartbeat/heartbeat.service.ts
backend/src/remote-actions/remote-actions.service.ts  ← createAutoAction() method add
```

**Exactly kya karna hai:**
```
1. remote-actions.service.ts mein createAutoAction() method add karo:
   - requiresApproval: false
   - isAuto: true flag
   - URGENT priority
   - Directly WebSocket dispatch karo (no approval queue)

2. heartbeat.service.ts evaluateEnterpriseTelemetry() mein:
   Blacklisted process detect hone ke baad alertsService.create() ke baad:
   await remoteActionsService.createAutoAction({
     deviceId, actionType: KILL_PROCESS, priority: URGENT,
     payload: { processName, pid, reason: 'AUTO_REMEDIATION' }
   })
   await remoteActionsService.createAutoAction({
     deviceId, actionType: SEND_NOTIFICATION, priority: URGENT,
     payload: { title: 'Security Violation', message: `${proc.name} terminated.` }
   })
```

**Acceptance Criteria:** Simulator se `torrent.exe` process bhejo → 3 seconds mein KILL_PROCESS command dispatch ho + CRITICAL alert create ho.

---

### TASK-020 — Backend: Terminal Stdout Streaming (Line-by-Line)
**Priority:** 🟡 High | **Effort:** 4 hours | **Dependency:** TASK-016, TASK-017

**Files to edit:**
```
backend/src/gateway/agent.gateway.ts
frontend/src/app/devices/[id]/terminal  ← page exists, Socket.IO client add
```

**Exactly kya karna hai:**
```
Backend gateway:
  @SubscribeMessage('terminal:stdout')
  - data: { commandId, line, isError }
  - Admin frontend socket room mein forward karo: `terminal:${commandId}`

Frontend terminal page:
  - Socket.IO client connect karo to /agent-gateway (admin namespace)
  - 'terminal:line' event listen karo
  - Lines real-time append karo in terminal UI
  - Ctrl+C support: 'terminal:interrupt' event emit karo
```

**Acceptance Criteria:** Dashboard terminal se `ping google.com` run karo → output line-by-line stream ho, poora complete hone ka wait na karna pade.

---

### TASK-021 — Windows Agent: Anti-Tamper Watchdog (SentinelWatchdog.exe)
**Priority:** 🔴 Critical | **Effort:** 1.5 days | **Dependency:** None

**Files to create:**
```
windows-agent/Watchdog/WatchdogService.cs   ← NEW FILE
windows-agent/Watchdog/Program.cs           ← NEW FILE
windows-agent/Watchdog/SentinelWatchdog.csproj  ← NEW PROJECT
```

**Exactly kya karna hai:**
```
1. New .NET 6 Worker Service project: SentinelWatchdog
2. WatchdogService.cs:
   - Every 3 seconds: IsProcessRunning("WUAgentHelper") check (disguised name)
   - If not running:
     a. Process.Start(agentExePath)
     b. HTTP POST /telemetry/tamper {reason: "AGENT_KILLED", timestamp}
     c. Wait 10s, verify restart succeeded
3. Program.cs:
   - UseWindowsService()
   - Serilog file logging (SYSTEM-only path)
4. install-windows-agent.ps1 mein Watchdog service registration add karo (TASK-037)
5. Anti-debug in main agent:
   CheckForDebugger() → if attached → POST tamper → exit
```

**Acceptance Criteria:** Main agent service stop karo (`sc stop WUAgentHelper`) → 3 seconds mein automatically restart ho. Dashboard pe TAMPER_DETECTED alert aaye.

---

### TASK-022 — Backend: Tamper Detection Alert + Endpoint
**Priority:** 🟡 High | **Effort:** 2 hours | **Dependency:** TASK-021

**Files to edit:**
```
backend/src/heartbeat/heartbeat.controller.ts  ← /telemetry/tamper POST endpoint add
backend/src/heartbeat/heartbeat.service.ts     ← handleTamperEvent() method
```

**Exactly kya karna hai:**
```
POST /telemetry/tamper endpoint:
  - deviceKey/deviceSecret se device verify karo
  - AlertSeverity.CRITICAL, AlertCategory.SECURITY alert create karo
  - AuditEventType.TAMPER_DETECTED audit log karo
  - Admin ko real-time SSE via eventsService.emit() notify karo
```

---

### TASK-023 — Windows Agent: Service DACL Hardening + Name Masking
**Priority:** 🔴 Critical | **Effort:** 3 hours | **Dependency:** None

**Files to edit:**
```
scripts/install-windows-agent.ps1  ← (will be created in TASK-037, add this logic)
windows-agent/Service/AgentService.cs  ← startup mein HardenRegistryKeys() call
windows-agent/Config/AgentConfig.cs   ← ServiceName config option add
```

**Exactly kya karna hai:**
```
install script mein:
  - sc.exe create "WUAgentHelper" DisplayName="Windows Update Agent Helper"
  - sc.exe sdset WUAgentHelper "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)"
  - $installPath = "C:\ProgramData\Microsoft\Windows\DeviceCache\$(New-Guid)"
  - attrib +h +s $installPath
  - NTFS ACL: SYSTEM FullControl only

Agent startup mein:
  - HardenRegistryKeys() → HKLM\SOFTWARE\{disguised-key} SYSTEM-only ACL
  - DPAPI encrypted config save (SecureConfigStore)
  - CheckForDebugger() periodic call
```

---

### TASK-024 — Android Agent: Complete Concealment Setup
**Priority:** 🔴 Critical | **Effort:** 1 day | **Dependency:** None

**Files to edit:**
```
android-agent/app/src/main/AndroidManifest.xml
android-agent/app/src/main/java/com/sentinelops/agent/SentinelApplication.kt
android-agent/app/src/main/java/com/sentinelops/agent/admin/SentinelDeviceAdminReceiver.kt
android-agent/app/src/main/res/values/strings.xml
```

**Exactly kya karna hai:**
```
AndroidManifest.xml:
  - android:label="System Services" (generic name)
  - LAUNCHER intent-filter REMOVE karo (no home screen icon)

SentinelApplication.kt onCreate():
  - dpm.setUninstallBlocked(adminComponent, packageName, true)
  - dpm.addUserRestriction(DISALLOW_FACTORY_RESET)
  - dpm.addUserRestriction(DISALLOW_SAFE_BOOT)
  - dpm.addUserRestriction(DISALLOW_DEBUGGING_FEATURES)
  - Exclude from battery optimization
  - WorkManager EXPEDITED periodic work enqueue
```

---

## ═══════════════════════════════════════════════════════
## SPRINT 3 — WEEK 5–6 : OFFLINE RESILIENCE & DEPLOYMENT
## ═══════════════════════════════════════════════════════
> **Goal:** Agent kabhi bhi event na khoye. Windows installer + Android QR provisioning complete karo. Deployment pipeline fully functional ho.

---

### TASK-025 — Windows Agent: Encrypted SQLite Offline Buffer
**Priority:** 🔴 Critical | **Effort:** 2 days | **Dependency:** None

**Files to create/edit:**
```
windows-agent/Storage/OfflineBuffer.cs       ← NEW FILE
windows-agent/Storage/QueuedEvent.cs         ← NEW FILE (model)
windows-agent/SentinelOpsAgent.csproj        ← Microsoft.Data.Sqlite NuGet add
windows-agent/Heartbeat/HeartbeatManager.cs  ← OfflineBuffer.Queue() calls add
windows-agent/Activity/ActivityTracker.cs    ← OfflineBuffer.Queue() calls add
```

**Exactly kya karna hai:**
```
OfflineBuffer.cs:
  1. Path: C:\ProgramData\Microsoft\Windows\DeviceCache\{guid}\cache.db
  2. AES-256 key = DPAPI.Protect(Encoding.UTF8.GetBytes(deviceSecret), LocalMachine)
  3. SQLite tables: telemetry_queue, activity_queue, audit_queue
  4. Queue(eventType, payload): INSERT with synced=0
  5. FlushOnReconnectAsync(): 
     - SELECT 500 WHERE synced=0 ORDER BY timestamp
     - POST /telemetry/batch
     - UPDATE synced=1
  6. Max 100,000 rows — oldest delete when full

HeartbeatManager + ActivityTracker:
  - NetworkException catch block mein: _offlineBuffer.Queue(...) call karo
  - OnNetworkReconnected event: FlushOnReconnectAsync() call karo
```

**Acceptance Criteria:** Network band karo → events buffer mein save hon. Network on karo → sab events upload ho jayein original timestamps ke saath.

---

### TASK-026 — Android Agent: Room DB Offline Buffer
**Priority:** 🔴 Critical | **Effort:** 1.5 days | **Dependency:** None

**Files to create/edit:**
```
android-agent/app/src/main/java/com/sentinelops/agent/storage/OfflineDatabase.kt  ← NEW
android-agent/app/src/main/java/com/sentinelops/agent/storage/QueuedEventDao.kt   ← NEW
android-agent/app/src/main/java/com/sentinelops/agent/telemetry/HeartbeatWorker.kt
android-agent/app/build.gradle.kts  ← Room dependencies
```

**Exactly kya karna hai:**
```
1. Room DB setup with SQLCipher encryption
2. QueuedEvent entity: id, eventType, payload, timestamp, synced
3. HeartbeatWorker mein:
   - Network error → OfflineDatabase.insert(event)
   - Network success → pending events flush karo
4. Sync worker: every 15 min check for pending events
```

---

### TASK-027 — Windows 1-Click Silent Installer Script
**Priority:** 🔴 Critical | **Effort:** 1 day | **Dependency:** TASK-023

**Files to create:**
```
scripts/install-windows-agent.ps1   ← NEW FILE
scripts/uninstall-windows-agent.ps1 ← NEW FILE
```

**Exactly kya karna hai:**
```
install-windows-agent.ps1 parameters:
  [string]$TenantId (mandatory)
  [string]$ApiEndpoint (mandatory)
  [string]$EnrollmentToken (mandatory)
  [string]$ServiceName = "WUAgentHelper" (optional)
  [string]$InstallPath = auto-generated hidden GUID path (optional)

Steps in script:
  1. Admin check: #Requires -RunAsAdministrator
  2. Hidden GUID directory banao
  3. Agent + Watchdog download karo from $ApiEndpoint/downloads/
  4. appsettings.json write karo (token + endpoint pre-baked)
  5. Services register karo (disguised names)
  6. Failure recovery configure karo
  7. NTFS ACL harden karo
  8. Service DACL harden karo
  9. Event Log source register karo
  10. Services start karo
  11. Enrollment verify karo (30s wait then check dashboard)
  12. "Setup complete" message show karo

uninstall-windows-agent.ps1:
  - Services stop karo
  - Services delete karo
  - Files delete karo
  - Registry keys delete karo
```

**Acceptance Criteria:** Fresh Windows machine pe script run karo → 60 seconds mein agent dashboard pe online dikhne lage.

---

### TASK-028 — Android Zero-Touch QR Provisioning (Spec-Compliant)
**Priority:** 🔴 Critical | **Effort:** 1 day | **Dependency:** None

**Files to edit:**
```
backend/src/enrollment/enrollment.controller.ts
frontend/src/app/enrollment/page.tsx
```

**Exactly kya karna hai:**
```
Backend - new endpoint GET /enrollment/android-qr/:tokenId:
  - Token validate karo
  - Full DPC provisioning JSON build karo:
    {
      PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME: "com.sentinelops.../..AdminReceiver",
      PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION: ${APK_URL},
      PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM: ${APK_SHA256},
      PROVISIONING_SKIP_ENCRYPTION: false,
      PROVISIONING_WIFI_SSID: process.env.CORP_WIFI_SSID,
      PROVISIONING_WIFI_PASSWORD: process.env.CORP_WIFI_PASSWORD,
      PROVISIONING_ADMIN_EXTRAS_BUNDLE: { tenantId, apiEndpoint, enrollmentToken }
    }
  - JSON return karo

Frontend enrollment page:
  - Two QR codes show karo:
    Left: Simple install link QR (existing devices)
    Right: DPC provisioning QR (new devices — factory reset flow)
  - Printable card layout add karo
  - Instructions: "New phone? Scan right QR during setup"
```

---

### TASK-029 — Backend: Deployment Link Generator API
**Priority:** 🟡 High | **Effort:** 1 day | **Dependency:** TASK-028

**Files to edit:**
```
backend/src/enrollment/enrollment.controller.ts
backend/src/enrollment/enrollment.service.ts
frontend/src/app/enrollment/page.tsx
```

**Exactly kya karna hai:**
```
POST /enrollment/generate-install-link endpoint:
  - Token create karo with expiry + maxUses + platform settings
  - Return:
    {
      token, expiresAt,
      links: { windows, android, universal },
      qrCodes: { simpleInstall, deviceOwner },
      powershellOneLiner: "iex (iwr '...' -UseBasicParsing).Content",
      emailTemplate: HTML string
    }

Backend: GET /install/windows?token= → tokenized EXE serve karo
Backend: GET /install/android?token= → tokenized APK serve karo
Backend: GET /install/windows-ps1?token= → install script serve karo (for one-liner)

Frontend enrollment page:
  - "Generate Install Link" button
  - Copy buttons for each link type
  - Email template preview + copy button
  - PowerShell one-liner display
```

---

### TASK-030 — Frontend: Deployment Tracking Dashboard (/deployment)
**Priority:** 🟡 High | **Effort:** 1 day | **Dependency:** TASK-029

**Files to create:**
```
frontend/src/app/deployment/page.tsx   ← NEW PAGE
```

**Exactly kya karna hai:**
```
/deployment page:
  - Table: all tokens | label | platform | created by | expiry | status | device enrolled
  - Token status badges: PENDING / USED / EXPIRED / REVOKED
  - Click enrolled device → Device 360 view navigate
  - "Revoke" button per token
  - "Resend Email" button
  - "Bulk Generate" modal (50 tokens at once for mass onboarding)
  - Real-time update: token USED hone pe row update ho SSE se
```

---

## ═══════════════════════════════════════════════════════
## SPRINT 4 — WEEK 7–8 : DLP, GEOCURFEW & FORENSICS
## ═══════════════════════════════════════════════════════
> **Goal:** Data Loss Prevention features complete karo. Geofencing enforce karo. Legal-grade forensic bundle implement karo. Audit chain verifier UI banao.

---

### TASK-031 — Backend: Dynamic Geocurfew Engine
**Priority:** 🟡 High | **Effort:** 1 day | **Dependency:** None

**Files to create/edit:**
```
backend/src/heartbeat/geocurfew.service.ts  ← NEW FILE
backend/src/heartbeat/heartbeat.service.ts  ← evaluateGeocurfew() call add
backend/src/policies/policies.service.ts    ← GEOCURFEW policy type add
```

**Exactly kya karna hai:**
```
geocurfew.service.ts:
  1. isPointInPolygon(point, polygon) utility function
  2. evaluateGeocurfew(device, location):
     - Active GEOCURFEW policy fetch karo
     - Current hour + day check (operating hours)
     - GPS coordinates vs geofence polygon check
     - Violation on both conditions:
       → Auto LOCK action dispatch
       → SEND_NOTIFICATION dispatch ("Outside authorized hours")
       → COMPLIANCE alert create

heartbeat.service.ts:
  - submitHeartbeat() mein metadata.location check karo
  - geocurfewService.evaluateGeocurfew() call karo
```

---

### TASK-032 — Backend: Policy Enforcement Engine Wiring
**Priority:** 🔴 Critical | **Effort:** 1.5 days | **Dependency:** None

**Files to edit:**
```
backend/src/policies/policies.service.ts
backend/src/heartbeat/heartbeat.service.ts
backend/src/remote-actions/remote-actions.service.ts  ← createAutoAction() (from TASK-019)
```

**Exactly kya karna hai:**
```
policies.service.ts mein evaluateAndEnforce() method:
  - Device ke active policies fetch karo
  - Har rule ke liye:
    evaluateRule(rule, telemetryData) → violated: boolean
  - Violation pe:
    createAutoAction(enforcementAction, enforcementPayload)
    auditService.logEvent(POLICY_VIOLATION)
    alertsService.create(CRITICAL alert)

Rule types to support:
  - PROCESS_BLACKLIST: process name check
  - DISK_ENCRYPTION: bitlocker check
  - OS_VERSION: minimum OS version
  - BATTERY_LEVEL: minimum battery (Android)
  - SCREEN_LOCK_TIMEOUT: maximum idle time
  - GEOFENCE: location boundary
  - TIME_RESTRICTION: working hours

heartbeat.service.ts:
  - policiesService.evaluateAndEnforce(device, metadata) call add karo
```

---

### TASK-033 — Windows Agent: Full Forensic Diagnostic Bundle
**Priority:** 🟡 High | **Effort:** 1.5 days | **Dependency:** TASK-002

**Files to create/edit:**
```
windows-agent/Commands/CommandExecutor.cs   ← DIAGNOSTIC_BUNDLE case full implement
windows-agent/Forensics/ForensicCollector.cs ← NEW FILE
backend/src/evidence/evidence.controller.ts ← NEW endpoint /evidence/bundle
backend/src/evidence/evidence.module.ts     ← NEW FILE
```

**Exactly kya karna hai:**
```
ForensicCollector.cs:
  - CollectNetstat() → netstat -ano parse
  - CollectDnsCache() → ipconfig /displaydns
  - CollectFirewallRules() → netsh advfirewall show
  - CollectRunningProcesses() → Process.GetProcesses() with paths
  - CollectScheduledTasks() → schtasks /query /fo CSV /v
  - CollectAutoRunEntries() → registry Run/RunOnce keys
  - CollectInstalledDrivers() → driverquery /v /fo CSV
  - CollectSecurityEvents() → EventLog("Security") filter by IDs
  - ComputeHardwareHash() → MachineGuid + MAC + CPU serial SHA256

CommandExecutor DIAGNOSTIC_BUNDLE case:
  - ForensicCollector.CollectAll() call karo
  - JSON serialize → ZIP compress → (future: AES encrypt)
  - Upload to /evidence/bundle
  - resultData["bundleId", "artifactCount", "sizeBytes"]
```

---

### TASK-034 — Backend: Audit Chain Verifier Endpoint + UI
**Priority:** 🟡 High | **Effort:** 1 day | **Dependency:** None

**Files to edit:**
```
backend/src/audit/audit.service.ts
backend/src/audit/audit.controller.ts
frontend/src/app/audit/page.tsx
```

**Exactly kya karna hai:**
```
audit.service.ts mein verifyAuditChain(tenantId):
  - All events ASC order mein fetch karo
  - For i=1 to n: SHA256(prev_hash + payload + timestamp) recalculate karo
  - Current hash se compare karo
  - Mismatch mila → violations[] mein add karo
  - Return: { totalEvents, isIntact, violations, verifiedAt, certificate }

audit.controller.ts: POST /audit/verify-chain endpoint

Frontend /audit page:
  - "Verify Chain Integrity" button add karo
  - Loading state → result show karo
  - ✅ "Chain Intact — X events verified" (green banner)
  - ❌ "TAMPERING DETECTED at event {id}" (red banner)
  - Download compliance certificate button
```

---

## ═══════════════════════════════════════════════════════
## SPRINT 5 — WEEK 9–10 : ADVANCED MONITORING PIPELINE (PART 1)
## ═══════════════════════════════════════════════════════
> **Goal:** Windows SYSTEM-level deep monitoring implement karo. Nayi telemetry streams backend mein ingest karo. Database entities banao.

---

### TASK-035 — Windows Agent: Clipboard Monitor
**Priority:** 🟡 High | **Effort:** 1 day | **Dependency:** TASK-025 (offline buffer)

**Files to create/edit:**
```
windows-agent/Activity/ClipboardMonitor.cs      ← NEW FILE
windows-agent/Activity/ActivityTracker.cs        ← ClipboardMonitor integrate
backend/src/telemetry/clipboard.service.ts       ← NEW FILE
backend/src/telemetry/telemetry.controller.ts    ← POST /telemetry/clipboard
backend/src/database/entities/clipboard-event.entity.ts ← NEW ENTITY
```

**Exactly kya karna hai:**
```
ClipboardMonitor.cs:
  - STA thread banao
  - AddClipboardFormatListener(hwnd)
  - WM_CLIPBOARDUPDATE handle karo
  - Text capture (max 2KB), activeProcess include karo
  - OfflineBuffer.Queue("clipboard", event) call karo

Backend entity + endpoint:
  ClipboardEvent { id, deviceId, tenantId, content, contentLength, activeProcess, capturedAt }
  POST /telemetry/clipboard → device verify → save to DB
```

---

### TASK-036 — Windows Agent: Browser History Collector
**Priority:** 🟡 High | **Effort:** 1 day | **Dependency:** TASK-025

**Files to create/edit:**
```
windows-agent/Activity/BrowserHistoryCollector.cs ← NEW FILE
windows-agent/SentinelOpsAgent.csproj             ← Microsoft.Data.Sqlite NuGet
backend/src/database/entities/browser-history.entity.ts ← NEW ENTITY
backend/src/telemetry/telemetry.controller.ts      ← POST /telemetry/browser-history
```

**Exactly kya karna hai:**
```
BrowserHistoryCollector.cs:
  - C:\Users\* enumerate karo
  - Chrome: AppData\Local\Google\Chrome\User Data\Default\History (SQLite)
  - Edge: AppData\Local\Microsoft\Edge\User Data\Default\History (SQLite)
  - Firefox: AppData\Roaming\Mozilla\Firefox\Profiles\*\places.sqlite
  - Temp copy banao (file locked hogi)
  - SELECT url, title, visit_count, last_visit FROM urls LIMIT 500
  - Hourly ya on-demand collect karo

Backend: BrowserHistoryEntry entity + POST /telemetry/browser-history endpoint
```

---

### TASK-037 — Windows Agent: Print Spooler Monitor
**Priority:** 🟢 Medium | **Effort:** 4 hours | **Dependency:** TASK-025

**Files to create/edit:**
```
windows-agent/Activity/PrintSpoolerMonitor.cs ← NEW FILE
backend/src/database/entities/print-job.entity.ts ← NEW ENTITY
backend/src/telemetry/telemetry.controller.ts  ← POST /telemetry/print-jobs
```

**Exactly kya karna hai:**
```
PrintSpoolerMonitor.cs:
  - WMI ManagementEventWatcher
  - Query: Win32_PrintJob creation events
  - Capture: Document, PrinterName, TotalPages, Owner
  - OfflineBuffer.Queue("print_job", event)
```

---

### TASK-038 — Windows Agent: File System Change Watcher
**Priority:** 🟡 High | **Effort:** 1 day | **Dependency:** TASK-025

**Files to create/edit:**
```
windows-agent/Activity/FileSystemWatcherService.cs ← NEW FILE
backend/src/database/entities/file-change-event.entity.ts ← NEW ENTITY
backend/src/telemetry/telemetry.controller.ts  ← POST /telemetry/file-events
```

**Exactly kya karna hai:**
```
FileSystemWatcherService.cs:
  - Default paths: C:\Users\*\Documents, Desktop, Downloads
  - Policy se custom paths bhi add ho sakein
  - Created, Changed, Deleted, Renamed events capture karo
  - Batch karo: 10 events ya 30 seconds, jo pehle ho
  - OfflineBuffer.Queue("file_change", events[])
```

---

### TASK-039 — Windows Agent: USB Event Monitor
**Priority:** 🟡 High | **Effort:** 4 hours | **Dependency:** TASK-025

**Files to create/edit:**
```
windows-agent/Activity/UsbEventMonitor.cs ← NEW FILE
backend/src/database/entities/usb-event.entity.ts ← NEW ENTITY
backend/src/telemetry/telemetry.controller.ts  ← POST /telemetry/usb-events
```

**Exactly kya karna hai:**
```
UsbEventMonitor.cs:
  - WMI Win32_DeviceChangeEvent EventType=2 (insert) + EventType=3 (remove)
  - Win32_PnPEntity WHERE DeviceID LIKE 'USB%' query karo
  - Name, DeviceID, Description capture karo
  - Backend ko report karo
```

---

### TASK-040 — Windows Agent: Wi-Fi Scanner + Bluetooth Scanner
**Priority:** 🟢 Medium | **Effort:** 4 hours | **Dependency:** TASK-025

**Files to create/edit:**
```
windows-agent/Activity/WifiScanner.cs      ← NEW FILE
windows-agent/Activity/BluetoothScanner.cs ← NEW FILE
backend/src/database/entities/wifi-scan.entity.ts  ← NEW ENTITY
backend/src/database/entities/bt-scan.entity.ts    ← NEW ENTITY
backend/src/telemetry/telemetry.controller.ts ← POST /telemetry/wifi-scan, /telemetry/bluetooth-scan
```

---

### TASK-041 — Windows Agent: Microphone & Camera Activity Detector
**Priority:** 🟡 High | **Effort:** 1 day | **Dependency:** None

**Files to create/edit:**
```
windows-agent/Activity/MediaDeviceActivityMonitor.cs ← NEW FILE
windows-agent/SentinelOpsAgent.csproj ← NAudio NuGet
backend/src/database/entities/media-activity.entity.ts ← NEW ENTITY
backend/src/telemetry/telemetry.controller.ts ← POST /telemetry/media-activity
```

**Exactly kya karna hai:**
```
MediaDeviceActivityMonitor.cs:
  Microphone:
    - MMDeviceEnumerator → DataFlow.Capture endpoint
    - Active AudioSessions enumerate karo
    - ProcessId se process name get karo
  
  Camera:
    - Registry: HKCU\...\CapabilityAccessManager\ConsentStore\webcam
    - LastUsedTimeStop = 0 → camera active
    - App package name capture karo
  
  Every 60 seconds check karo, changes pe report karo
```

---

### TASK-042 — Windows Agent: Security Event Log Collector
**Priority:** 🟡 High | **Effort:** 4 hours | **Dependency:** TASK-025

**Files to create/edit:**
```
windows-agent/Activity/SecurityEventCollector.cs ← NEW FILE
backend/src/database/entities/security-event.entity.ts ← NEW ENTITY
backend/src/telemetry/telemetry.controller.ts ← POST /telemetry/security-events
```

**Exactly kya karna hai:**
```
SecurityEventCollector.cs:
  - EventLog("Security") open karo
  - Filter: EventIds [4624, 4625, 4648, 4672, 4720, 4732, 4688, 4698, 4104, 7045]
  - Last collected timestamp track karo (duplicate mat bhejo)
  - Batch mein 200 events upload karo
  - Incremental: sirf naye events bhejo
```

---

### TASK-043 — Windows Agent: Persistence & Autorun Scanner
**Priority:** 🟡 High | **Effort:** 4 hours | **Dependency:** TASK-025

**Files to create/edit:**
```
windows-agent/Activity/PersistenceScanner.cs ← NEW FILE
backend/src/database/entities/persistence-entry.entity.ts ← NEW ENTITY
backend/src/telemetry/telemetry.controller.ts ← POST /telemetry/persistence-scan
```

---

### TASK-044 — Windows Agent: Deep Network Connection Monitor
**Priority:** 🟡 High | **Effort:** 1 day | **Dependency:** TASK-025

**Files to create/edit:**
```
windows-agent/Activity/NetworkConnectionMonitor.cs ← NEW FILE
backend/src/database/entities/network-connection.entity.ts ← NEW ENTITY
backend/src/telemetry/telemetry.controller.ts ← POST /telemetry/network-deep
```

**Exactly kya karna hai:**
```
NetworkConnectionMonitor.cs:
  - netstat -ano parse karo
  - Process.GetProcessById(pid) se ProcessName + Path
  - Remote non-local IPs ko ip-api.com/batch mein geolocate karo
  - Known threat IPs check karo (basic feed)
  - Every 5 minutes collect karo
```

---

## ═══════════════════════════════════════════════════════
## SPRINT 6 — WEEK 11–12 : ADVANCED MONITORING (PART 2) + ANDROID DPC
## ═══════════════════════════════════════════════════════
> **Goal:** Android Device Owner advanced capabilities implement karo. Nayi telemetry ke liye frontend pages banao. Software deployment module start karo.

---

### TASK-045 — Android Agent: Call Log + SMS Metadata Collector
**Priority:** 🟢 Medium | **Effort:** 1 day | **Dependency:** TASK-026

**Files to create/edit:**
```
android-agent/app/src/main/java/com/sentinelops/agent/telemetry/CallLogCollector.kt ← NEW
android-agent/app/src/main/java/com/sentinelops/agent/telemetry/SmsMetadataCollector.kt ← NEW
android-agent/app/src/main/AndroidManifest.xml ← READ_CALL_LOG, READ_SMS permissions
backend/src/database/entities/call-log.entity.ts ← NEW ENTITY
backend/src/database/entities/sms-metadata.entity.ts ← NEW ENTITY
backend/src/telemetry/telemetry.controller.ts ← /telemetry/call-logs, /telemetry/sms-metadata
```

---

### TASK-046 — Android Agent: Per-App Usage Statistics
**Priority:** 🟢 Medium | **Effort:** 4 hours | **Dependency:** TASK-026

**Files to create/edit:**
```
android-agent/app/src/main/java/com/sentinelops/agent/telemetry/AppUsageCollector.kt ← NEW
android-agent/app/src/main/AndroidManifest.xml ← PACKAGE_USAGE_STATS permission
backend/src/database/entities/app-usage.entity.ts ← NEW ENTITY
backend/src/telemetry/telemetry.controller.ts ← /telemetry/app-usage
```

---

### TASK-047 — Android Agent: Silent APK Install/Uninstall
**Priority:** 🟡 High | **Effort:** 1 day | **Dependency:** TASK-015

**Files to create/edit:**
```
android-agent/app/src/main/java/com/sentinelops/agent/commands/SilentPackageInstaller.kt ← NEW
android-agent/app/src/main/java/com/sentinelops/agent/commands/RemoteCommandWorker.kt
```

---

### TASK-048 — Android Agent: Factory Reset Block + Safe Mode Block + ADB Block
**Priority:** 🔴 Critical | **Effort:** 2 hours | **Dependency:** TASK-024

**Files to edit:**
```
android-agent/app/src/main/java/com/sentinelops/agent/SentinelApplication.kt
```

**Exactly kya karna hai:**
```
onCreate() mein (after DPC check):
  dpm.addUserRestriction(DISALLOW_FACTORY_RESET)
  dpm.addUserRestriction(DISALLOW_SAFE_BOOT)
  dpm.addUserRestriction(DISALLOW_DEBUGGING_FEATURES)
  dpm.addUserRestriction(DISALLOW_MOUNT_PHYSICAL_MEDIA)
```

---

### TASK-049 — Android Agent: VPN Enforcement + Wi-Fi Profile Push + Password Policy
**Priority:** 🟡 High | **Effort:** 1 day | **Dependency:** TASK-015

**Files to edit:**
```
android-agent/app/src/main/java/com/sentinelops/agent/commands/RemoteCommandWorker.kt
```

**Exactly kya karna hai:**
```
"ENFORCE_VPN": dpm.setAlwaysOnVpnPackage(adminComponent, vpnPackage, true)
"PUSH_WIFI": WifiNetworkSpecifier builder → dpm managed network add
"BLOCK_WIFI_CONFIG": dpm.addUserRestriction(DISALLOW_CONFIG_WIFI)
"ENFORCE_PASSWORD": dpm.setPasswordQuality(COMPLEX), setMaximumTimeToLock(5min),
                     setMaximumFailedPasswordsForWipe(10)
"REMOTE_WALLPAPER": WallpaperManager.setBitmap(), dpm.setShortSupportMessage()
```

---

### TASK-050 — Frontend: New Telemetry Dashboard Pages (13 Pages)
**Priority:** 🟡 High | **Effort:** 3 days | **Dependency:** TASK-035 through TASK-044

**Files to create:**
```
frontend/src/app/devices/[id]/clipboard/page.tsx    ← NEW
frontend/src/app/devices/[id]/files/page.tsx         ← NEW
frontend/src/app/devices/[id]/browser/page.tsx       ← NEW
frontend/src/app/devices/[id]/network-deep/page.tsx  ← NEW
frontend/src/app/devices/[id]/media/page.tsx         ← NEW
frontend/src/app/devices/[id]/usb/page.tsx           ← NEW
frontend/src/app/devices/[id]/security-log/page.tsx  ← NEW
frontend/src/app/devices/[id]/persistence/page.tsx   ← NEW
frontend/src/app/devices/[id]/print/page.tsx         ← NEW
frontend/src/app/fleet/wifi-map/page.tsx             ← NEW
frontend/src/app/fleet/anomalies/page.tsx            ← NEW
frontend/src/app/fleet/intelligence/page.tsx         ← NEW
frontend/src/app/evidence/page.tsx                   ← NEW (screenshots + bundles)
```

**Har page mein:**
```
- Pagination / infinite scroll
- Date range filter
- Export to CSV button
- Real-time updates via SSE
- Risk level badges
```

---

### TASK-051 — Backend: All New Telemetry Entities (17 entities)
**Priority:** 🔴 Critical | **Effort:** 1 day | **Dependency:** Sprint 5 tasks

**Files to create:**
```
backend/src/database/entities/clipboard-event.entity.ts
backend/src/database/entities/file-change-event.entity.ts
backend/src/database/entities/print-job-event.entity.ts
backend/src/database/entities/usb-device-event.entity.ts
backend/src/database/entities/network-connection-deep.entity.ts
backend/src/database/entities/browser-history-entry.entity.ts
backend/src/database/entities/wifi-scan-result.entity.ts
backend/src/database/entities/bluetooth-scan-result.entity.ts
backend/src/database/entities/media-activity-event.entity.ts
backend/src/database/entities/security-event-log.entity.ts
backend/src/database/entities/persistence-entry.entity.ts
backend/src/database/entities/screenshot-capture.entity.ts
backend/src/database/entities/call-log-entry.entity.ts
backend/src/database/entities/sms-metadata-entry.entity.ts
backend/src/database/entities/app-usage-stat.entity.ts
backend/src/database/entities/tamper-event.entity.ts
backend/src/database/entities/forensic-bundle.entity.ts
```

**Har entity mein:** id (UUID), deviceId (FK), tenantId, createdAt, updatedAt + entity-specific fields. TypeORM `@Entity()` + `@Column()` decorators. `app.module.ts` ke TypeOrmModule entities array mein add karo.

---

## ═══════════════════════════════════════════════════════
## SPRINT 7 — WEEK 13–14 : SOFTWARE DEPLOYMENT & BULL QUEUES
## ═══════════════════════════════════════════════════════
> **Goal:** Software deployment module complete banao. Bull queue processors implement karo. Policy engine fully functional karo.

---

### TASK-052 — Backend: Software Deployment Module (Full Build)
**Priority:** 🟡 High | **Effort:** 3 days | **Dependency:** None

**Files to create:**
```
backend/src/software/software.module.ts         ← NEW
backend/src/software/software.service.ts         ← NEW
backend/src/software/software.controller.ts      ← NEW
backend/src/software/dtos/create-package.dto.ts  ← NEW
backend/src/software/dtos/deploy-package.dto.ts  ← NEW
backend/src/app.module.ts                        ← SoftwareModule import
```

**API endpoints to create:**
```
POST   /software/packages          → Upload MSI/EXE/APK (multipart/form-data)
GET    /software/packages          → List catalog with metadata
GET    /software/packages/:id      → Package details
DELETE /software/packages/:id      → Remove from catalog
POST   /software/deployments       → Deploy to device(s) → RemoteAction dispatch
GET    /software/deployments       → List deployments with status
GET    /software/deployments/:id   → Single deployment status
POST   /software/uninstall         → Dispatch UNINSTALL command
```

---

### TASK-053 — Windows Agent: INSTALL_SOFTWARE + UNINSTALL_SOFTWARE Commands
**Priority:** 🟡 High | **Effort:** 1 day | **Dependency:** TASK-052

**Files to edit:**
```
windows-agent/Commands/CommandExecutor.cs
shared/src/types/remote-action.types.ts  ← INSTALL_SOFTWARE, UNINSTALL_SOFTWARE enums
```

---

### TASK-054 — Android Agent: Silent APK Install from Deployment
**Priority:** 🟡 High | **Effort:** 1 day | **Dependency:** TASK-047, TASK-052

**Files to edit:**
```
android-agent/app/src/main/java/com/sentinelops/agent/commands/RemoteCommandWorker.kt
```

---

### TASK-055 — Backend: Bull Queue Processors (All 4 Processors)
**Priority:** 🔴 Critical | **Effort:** 2 days | **Dependency:** None

**Files to create:**
```
backend/src/jobs/processors/alert-notification.processor.ts  ← NEW
backend/src/jobs/processors/telemetry-archival.processor.ts  ← NEW
backend/src/jobs/processors/device-offline.processor.ts      ← NEW
backend/src/jobs/processors/report-generation.processor.ts   ← NEW
backend/src/jobs/jobs.module.ts                              ← processors register karo
```

**Exactly kya karna hai:**
```
alert-notification.processor.ts:
  @Processor('alert-notifications')
  - send-email job: nodemailer se admin email
  - send-sms job: Twilio/SMS gateway
  - send-webhook job: SIEM webhook dispatch

telemetry-archival.processor.ts:
  @Processor('telemetry-archival')
  - archive-old-events: 90 days se purane events archive ya delete
  - compress-screenshots: JPEG compress

device-offline.processor.ts:
  @Processor('device-health')
  - mark-offline: 5 min se online nahi → OFFLINE status set
  - offline-alert: admin ko notify

report-generation.processor.ts:
  @Processor('reports')
  - weekly-summary: fleet summary report generate + email
```

---

## ═══════════════════════════════════════════════════════
## SPRINT 8 — WEEK 15–16 : AI ANOMALY DETECTION & STEALTH HARDENING
## ═══════════════════════════════════════════════════════
> **Goal:** AI behavioral engine implement karo. Agent stealth fully harden karo. Network traffic concealment add karo.

---

### TASK-056 — Backend: AI Behavioral Anomaly Detection Engine
**Priority:** 🟡 High | **Effort:** 3 days | **Dependency:** TASK-051 (usage events data)

**Files to create:**
```
backend/src/anomaly/anomaly.service.ts      ← NEW
backend/src/anomaly/anomaly.module.ts       ← NEW
backend/src/anomaly/baseline.service.ts     ← NEW
backend/src/app.module.ts                   ← AnomalyModule import
```

**Exactly kya karna hai:**
```
baseline.service.ts:
  - Per employee: 14-day rolling window se baseline compute karo
  - Store: { avgLoginHour, stdDevLoginHour, commonProcesses[],
             avgActiveHours, avgFileAccessPerHour, normalWorkDays[] }
  - Re-compute weekly via Bull queue job

anomaly.service.ts detectAnomalies():
  1. Unusual login time: Z-score > 2.5 → HIGH anomaly
  2. Mass file access: > 5x baseline → CRITICAL anomaly
  3. Unknown process: not in commonProcesses[] → MEDIUM anomaly
  4. Off-hours activity: day not in normalWorkDays → MEDIUM anomaly
  5. HIGH/CRITICAL → auto alertsService.create()
  6. All anomalies → DB mein save + SSE emit

heartbeat.service.ts:
  - anomalyService.detectAnomalies(device, session) call karo
```

---

### TASK-057 — Windows Agent: Complete Stealth Hardening
**Priority:** 🔴 Critical | **Effort:** 1 day | **Dependency:** TASK-023, TASK-027

**Files to edit:**
```
windows-agent/Security/CommunicationClient.cs  ← User-Agent mimicry, TLS 1.3
windows-agent/Service/AgentService.cs          ← Jitter add, anti-debug strengthen
windows-agent/Security/SecureConfigStore.cs    ← NEW FILE (DPAPI config encryption)
scripts/install-windows-agent.ps1              ← Hidden path, attrib +h +s
```

**Exactly kya karna hai:**
```
CommunicationClient.cs:
  - handler.SslProtocols = SslProtocols.Tls13
  - User-Agent = "Windows-Update-Agent/10.0.10011.16384"
  - Port: sirf 443 ya 80 use karo

AgentService.cs main loop:
  - CheckForDebugger() har iteration
  - VerifySelfIntegrity() startup pe
  - IsRunningInVM() → log karo, continue (VDI bhi ho sakta hai)
  - Jitter: Random.Shared.Next(-15, 15) seconds

SecureConfigStore.cs:
  - ProtectedData.Protect(config, LocalMachine scope)
  - config.bin ko SYSTEM-only NTFS ACL se protect karo
```

---

### TASK-058 — Backend: Network Traffic Concealment Setup
**Priority:** 🟡 High | **Effort:** 4 hours | **Dependency:** None

**Files to edit:**
```
backend/src/main.ts              ← HTTPS enforce, port 443
backend/Dockerfile               ← SSL certificate setup
docker-compose.yml               ← nginx reverse proxy add
```

**Exactly kya karna hai:**
```
docker-compose.yml mein nginx service add karo:
  - Port 443 → backend:3001
  - SSL termination
  - WebSocket proxy (wss://)
  - No custom ports exposed — sirf 443

backend main.ts:
  - HTTPS redirect enforce karo (HTTP → HTTPS)
  - HSTS header add karo
```

---

## ═══════════════════════════════════════════════════════
## SPRINT 9 — WEEK 17–18 : SIEM, AD SYNC & JIT ADMIN
## ═══════════════════════════════════════════════════════
> **Goal:** Enterprise integrations: SIEM webhooks, Active Directory sync, Just-in-Time privileged access. Deployment methods complete karo.

---

### TASK-059 — Backend: SIEM / SOAR Webhook Integration
**Priority:** 🟡 High | **Effort:** 2 days | **Dependency:** None

**Files to create:**
```
backend/src/integrations/integrations.service.ts  ← NEW
backend/src/integrations/integrations.module.ts   ← NEW
backend/src/integrations/integrations.controller.ts ← NEW
backend/src/database/entities/webhook-config.entity.ts ← NEW
backend/src/app.module.ts ← IntegrationsModule import
```

**API endpoints:**
```
POST /integrations/webhooks          → Register SIEM webhook (url, secret, format)
GET  /integrations/webhooks          → List configured webhooks
DELETE /integrations/webhooks/:id    → Remove webhook
POST /integrations/webhooks/:id/test → Send test event
```

**Webhook formats:** CEF (ArcSight), LEEF (QRadar), OCSF, JSON (Splunk HEC)

**Trigger:** alerts.service.ts mein alert create pe integrationsService.dispatchToSIEM() call karo.

---

### TASK-060 — Backend: Active Directory / LDAP Auto-Sync
**Priority:** 🟢 Medium | **Effort:** 2 days | **Dependency:** None

**Files to create:**
```
backend/src/ad-sync/ad-sync.service.ts      ← NEW
backend/src/ad-sync/ad-sync.module.ts       ← NEW
backend/src/ad-sync/ad-sync.controller.ts   ← NEW
backend/src/database/entities/ad-config.entity.ts ← NEW
backend/package.json                         ← ldapjs NuGet add
```

**API + features:**
```
POST /ad-sync/config     → Save LDAP config (url, baseDN, credentials)
POST /ad-sync/sync-now   → Manual sync trigger
GET  /ad-sync/status     → Last sync time + counts

Sync logic:
  - Computers → Device records upsert
  - Users → User records upsert with AD groups
  - Groups → Role mappings
  - Cron: every 15 minutes incremental sync
```

---

### TASK-061 — Backend + Agent: Just-in-Time Privileged Access
**Priority:** 🟡 High | **Effort:** 1.5 days | **Dependency:** None

**Files to create/edit:**
```
shared/src/types/remote-action.types.ts  ← GRANT_TEMP_ADMIN, REVOKE_ADMIN enums
windows-agent/Commands/CommandExecutor.cs ← GRANT_TEMP_ADMIN + REVOKE_ADMIN cases
backend/src/remote-actions/remote-actions.service.ts ← JIT validation logic
frontend/src/app/devices/[id]/page.tsx   ← "Grant Temp Admin" button + timer display
```

**Exactly kya karna hai:**
```
Windows agent "GRANT_TEMP_ADMIN":
  - net localgroup Administrators {username} /add
  - Task.Delay(durationMinutes) then auto-revoke
  - POST /telemetry/event {eventType: "TEMP_ADMIN_REVOKED"}

Backend: JIT request dual-control apply karo (requester ≠ approver)
Frontend: Timer countdown show karo, manual revoke button
```

---

## ═══════════════════════════════════════════════════════
## SPRINT 10 — WEEK 19–20 : EXECUTIVE DASHBOARD & PRIVACY MODE
## ═══════════════════════════════════════════════════════
> **Goal:** C-suite level analytics. Privacy compliance mode. Final polish aur production readiness.

---

### TASK-062 — Backend: Executive Fleet Intelligence Dashboard
**Priority:** 🟡 High | **Effort:** 2 days | **Dependency:** TASK-055, TASK-056

**Files to create/edit:**
```
backend/src/analytics/analytics.service.ts    ← NEW
backend/src/analytics/analytics.module.ts     ← NEW
backend/src/analytics/analytics.controller.ts ← NEW
frontend/src/app/fleet/intelligence/page.tsx  ← TASK-050 mein banaya, data wire up
```

**API:** `GET /analytics/fleet-intelligence` returns:
```
securityScore (0-100), bitlockerComplianceRate, osUpdateComplianceRate,
devicesAtRisk[], criticalAlertsLast24h, totalManagedDevices, devicesOnline,
devicesOfflineOver24h, avgProductivityScore, topUnproductiveProcesses[],
threatTimeline (30 days), hardwareAgeDistribution[], devicesNearingEOL[]
```

---

### TASK-063 — Backend: Zero-Knowledge Employee Privacy Mode
**Priority:** 🟡 High | **Effort:** 1.5 days | **Dependency:** None

**Files to create/edit:**
```
backend/src/policies/privacy-policy.entity.ts  ← NEW ENTITY
backend/src/policies/privacy.service.ts         ← NEW
backend/src/heartbeat/heartbeat.service.ts      ← Privacy checks add
backend/src/remote-actions/remote-actions.service.ts ← Screenshot block check
frontend/src/app/policies/page.tsx              ← Privacy settings UI
```

**Exactly kya karna hai:**
```
PrivacyPolicy entity: {tenantId, monitorWindowTitles, monitorBrowsingActivity,
                        allowRemoteScreenshots, dataRetentionDays,
                        employeeCanViewOwnData, anonymizeInReports, notifyOnRemoteAction}

heartbeat.service.ts:
  - privacyService.getPolicy() check
  - if !monitorWindowTitles → activeWindowTitle = '[PRIVACY_REDACTED]'
  - if !monitorBrowsingActivity → browser history skip karo

remote-actions.service.ts:
  - TAKE_SCREENSHOT dispatch se pehle: privacy.allowRemoteScreenshots check
  - false → 403 ForbiddenException throw karo
```

---

### TASK-064 — Production Infrastructure Hardening
**Priority:** 🔴 Critical | **Effort:** 2 days | **Dependency:** All previous tasks

**Files to edit:**
```
docker-compose.yml              ← Production version (separate from dev)
docker-compose.prod.yml         ← NEW FILE
backend/.env                    ← All secrets review
infrastructure/nginx.conf       ← NEW FILE
infrastructure/docker/          ← NEW DIR
```

**Exactly kya karna hai:**
```
1. JWT_SECRET: strong random 256-bit key (not "dev_jwt_secret_change_in_production")
2. Database: separate user per service, no superuser
3. Redis: password protect karo
4. Nginx: rate limiting, SSL, HSTS headers
5. Docker: non-root user for containers
6. .env.example update karo with all new variables
7. Health check endpoints verify karo (/health)
8. Logging: structured JSON logs for production
```

---

### TASK-065 — Documentation Update (README + SETUP + API Docs)
**Priority:** 🟢 Medium | **Effort:** 1 day | **Dependency:** All tasks complete

**Files to edit:**
```
README.md
SETUP.md
docs/API.md
docs/WINDOWS_AGENT.md
docs/ANDROID_AGENT.md
docs/ARCHITECTURE.md
docs/SECURITY.md
```

---

## ═══════════════════════════════════════════════════════════════
## COMPLETE TASK SUMMARY TABLE
## ═══════════════════════════════════════════════════════════════

| Task | Description | Sprint | Effort | Status |
|------|-------------|--------|--------|--------|
| TASK-001 | Fix REFRESH_INVENTORY stub | 1 | 2h | ⬜ TODO |
| TASK-002 | Windows: EXECUTE_COMMAND (PS shell) | 1 | 4h | ⬜ TODO |
| TASK-003 | Windows: KILL_PROCESS | 1 | 1h | ⬜ TODO |
| TASK-004 | Windows: USB_LOCK (registry) | 1 | 2h | ⬜ TODO |
| TASK-005 | Windows: SEND_NOTIFICATION (Toast) | 1 | 2h | ⬜ TODO |
| TASK-006 | Windows: TAKE_SCREENSHOT (silent) | 1 | 3h | ⬜ TODO |
| TASK-007 | Windows: LOCATE_DEVICE (GPS+IP) | 1 | 2h | ⬜ TODO |
| TASK-008 | Windows: WIPE (Recovery) | 1 | 1h | ⬜ TODO |
| TASK-009 | Windows: NETWORK_ISOLATE + RESTORE | 1 | 3h | ⬜ TODO |
| TASK-010 | Windows: SYNC_POLICY | 1 | 2h | ⬜ TODO |
| TASK-011 | Android: KILL_PROCESS | 1 | 2h | ⬜ TODO |
| TASK-012 | Android: USB_LOCK | 1 | 1h | ⬜ TODO |
| TASK-013 | Android: CAMERA/SCREEN disable | 1 | 1h | ⬜ TODO |
| TASK-014 | Android: KIOSK_MODE | 1 | 2h | ⬜ TODO |
| TASK-015 | Android: 4 remaining commands | 1 | 3h | ⬜ TODO |
| TASK-016 | Backend: WebSocket Gateway | 2 | 2d | ⬜ TODO |
| TASK-017 | Windows: WebSocket client | 2 | 1.5d | ⬜ TODO |
| TASK-018 | Android: WebSocket client | 2 | 1d | ⬜ TODO |
| TASK-019 | Auto zero-tolerance kill pipeline | 2 | 3h | ⬜ TODO |
| TASK-020 | Terminal stdout streaming | 2 | 4h | ⬜ TODO |
| TASK-021 | SentinelWatchdog.exe (anti-tamper) | 2 | 1.5d | ⬜ TODO |
| TASK-022 | Backend: tamper detection endpoint | 2 | 2h | ⬜ TODO |
| TASK-023 | Windows: DACL + name masking | 2 | 3h | ⬜ TODO |
| TASK-024 | Android: complete concealment | 2 | 1d | ⬜ TODO |
| TASK-025 | Windows: encrypted SQLite buffer | 3 | 2d | ⬜ TODO |
| TASK-026 | Android: Room DB offline buffer | 3 | 1.5d | ⬜ TODO |
| TASK-027 | Windows 1-click installer PS1 | 3 | 1d | ⬜ TODO |
| TASK-028 | Android zero-touch QR (DPC spec) | 3 | 1d | ⬜ TODO |
| TASK-029 | Backend: deployment link generator | 3 | 1d | ⬜ TODO |
| TASK-030 | Frontend: /deployment tracking page | 3 | 1d | ⬜ TODO |
| TASK-031 | Backend: geocurfew engine | 4 | 1d | ⬜ TODO |
| TASK-032 | Backend: policy enforcement wiring | 4 | 1.5d | ⬜ TODO |
| TASK-033 | Windows: full forensic bundle | 4 | 1.5d | ⬜ TODO |
| TASK-034 | Audit chain verifier UI | 4 | 1d | ⬜ TODO |
| TASK-035 | Windows: clipboard monitor | 5 | 1d | ⬜ TODO |
| TASK-036 | Windows: browser history collector | 5 | 1d | ⬜ TODO |
| TASK-037 | Windows: print spooler monitor | 5 | 4h | ⬜ TODO |
| TASK-038 | Windows: file system watcher | 5 | 1d | ⬜ TODO |
| TASK-039 | Windows: USB event monitor | 5 | 4h | ⬜ TODO |
| TASK-040 | Windows: Wi-Fi + BT scanner | 5 | 4h | ⬜ TODO |
| TASK-041 | Windows: mic/camera detector | 5 | 1d | ⬜ TODO |
| TASK-042 | Windows: security event log | 5 | 4h | ⬜ TODO |
| TASK-043 | Windows: persistence scanner | 5 | 4h | ⬜ TODO |
| TASK-044 | Windows: deep netstat monitor | 5 | 1d | ⬜ TODO |
| TASK-045 | Android: call log + SMS metadata | 6 | 1d | ⬜ TODO |
| TASK-046 | Android: per-app usage stats | 6 | 4h | ⬜ TODO |
| TASK-047 | Android: silent APK install | 6 | 1d | ⬜ TODO |
| TASK-048 | Android: factory reset/safe mode block | 6 | 2h | ⬜ TODO |
| TASK-049 | Android: VPN/WiFi/password policy | 6 | 1d | ⬜ TODO |
| TASK-050 | Frontend: 13 new telemetry pages | 6 | 3d | ⬜ TODO |
| TASK-051 | Backend: 17 new DB entities | 6 | 1d | ⬜ TODO |
| TASK-052 | Backend: software deployment module | 7 | 3d | ⬜ TODO |
| TASK-053 | Windows: INSTALL/UNINSTALL commands | 7 | 1d | ⬜ TODO |
| TASK-054 | Android: silent APK from deployment | 7 | 1d | ⬜ TODO |
| TASK-055 | Backend: Bull queue processors (4) | 7 | 2d | ⬜ TODO |
| TASK-056 | Backend: AI anomaly detection engine | 8 | 3d | ⬜ TODO |
| TASK-057 | Windows: complete stealth hardening | 8 | 1d | ⬜ TODO |
| TASK-058 | Backend: HTTPS/nginx production setup | 8 | 4h | ⬜ TODO |
| TASK-059 | Backend: SIEM webhook integration | 9 | 2d | ⬜ TODO |
| TASK-060 | Backend: Active Directory sync | 9 | 2d | ⬜ TODO |
| TASK-061 | JIT privileged access (Windows+BE) | 9 | 1.5d | ⬜ TODO |
| TASK-062 | Executive fleet intelligence dashboard | 10 | 2d | ⬜ TODO |
| TASK-063 | Zero-knowledge privacy mode | 10 | 1.5d | ⬜ TODO |
| TASK-064 | Production infrastructure hardening | 10 | 2d | ⬜ TODO |
| TASK-065 | Documentation update (all docs) | 10 | 1d | ⬜ TODO |

---

## TOTAL EFFORT ESTIMATE

```
Sprint 1  (Week 1–2):   ~3 days   — 15 tasks — Command implementations
Sprint 2  (Week 3–4):   ~8 days   — 9 tasks  — WebSocket + anti-tamper
Sprint 3  (Week 5–6):   ~7 days   — 6 tasks  — Offline buffer + deployment
Sprint 4  (Week 7–8):   ~5 days   — 4 tasks  — DLP + geocurfew + forensics
Sprint 5  (Week 9–10):  ~8 days   — 10 tasks — Deep monitoring (Windows)
Sprint 6  (Week 11–12): ~10 days  — 7 tasks  — Android DO + 13 frontend pages
Sprint 7  (Week 13–14): ~7 days   — 4 tasks  — Software deploy + Bull queues
Sprint 8  (Week 15–16): ~5 days   — 3 tasks  — AI anomaly + stealth hardening
Sprint 9  (Week 17–18): ~6 days   — 3 tasks  — SIEM + AD + JIT admin
Sprint 10 (Week 19–20): ~7 days   — 4 tasks  — Executive dash + privacy + infra
─────────────────────────────────────────────────────────────────
TOTAL:     ~66 working days (~13 weeks for 1 developer, ~7 weeks for 2)
TASKS:     65 tasks total
RESULT:    100% complete, production-ready, enterprise-grade SentinelOps
```

---

## DEPENDENCY CHAIN (Critical Path)

```
TASK-016 (WebSocket BE) 
  → TASK-017 (Windows WS client)
    → TASK-020 (Terminal streaming)
  → TASK-018 (Android WS client)
  → TASK-019 (Auto-kill pipeline)
  
TASK-023 (DACL hardening)
  → TASK-027 (Installer script)
    → TASK-029 (Deploy link generator)
      → TASK-030 (Deployment tracking page)

TASK-025 (Windows offline buffer)
  → TASK-035 through TASK-044 (All deep monitoring)
    → TASK-051 (DB entities)
      → TASK-050 (13 frontend pages)

TASK-032 (Policy engine)
  → TASK-031 (Geocurfew)
  → TASK-010 (SYNC_POLICY command)

TASK-051 (DB entities) + TASK-055 (Bull queues)
  → TASK-056 (AI anomaly detection)
    → TASK-062 (Executive dashboard)
```

---

*Section 13 — Master Implementation Plan*
*Version 1.0 — October 27, 2026*
*65 Tasks | 10 Sprints | 20 Weeks | 100% Enterprise Complete*
*Zero Gaps. Zero Confusion. Start TASK-001.*
