/**
 * SentinelOps Enterprise - Live Endpoint Agent Simulator
 * Simulates a company-owned Windows laptop reporting health, activity telemetry,
 * and executing remote operations dispatched from the IT Admin Console.
 */

const http = require('http');

const API_BASE = process.env.API_URL || 'http://localhost:3001/api';
const DEVICE_KEY = process.env.DEVICE_KEY || 'win_corp_key_001';
const DEVICE_SECRET = process.env.DEVICE_SECRET || 'win_corp_secret_001_secure_dev';

console.log('===========================================================');
console.log('🤖 SentinelOps Enterprise - Real-Time Agent Simulator');
console.log('Target API:     ', API_BASE);
console.log('Device Key:     ', DEVICE_KEY);
console.log('Device Secret:  ', DEVICE_SECRET);
console.log('===========================================================\n');

function makeRequest(path, method, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Key': DEVICE_KEY,
        'X-Device-Secret': DEVICE_SECRET,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// 1. Send periodic heartbeat with rich hardware & location telemetry
async function sendHeartbeat() {
  const cpu = +(15 + Math.random() * 30).toFixed(1);
  const mem = +(55 + Math.random() * 15).toFixed(1);
  const cpuTemp = +(45 + Math.random() * 10).toFixed(1);

  const payload = {
    deviceKey: DEVICE_KEY,
    deviceSecret: DEVICE_SECRET,
    health: {
      cpuUsage: cpu,
      memoryUsage: mem,
      diskUsage: 45.0,
      batteryLevel: 92,
      batteryStatus: 'Charging',
      uptime: Math.floor(process.uptime()) + 36000,
    },
    connectivity: {
      isConnected: true,
      connectionType: 'WiFi 6 (802.11ax)',
      latency: 7.2,
      networkSpeed: 850,
    },
    agent: {
      status: 'healthy',
      lastCommand: 'none',
      pendingCommands: 0,
    },
    metadata: {
      location: {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 8.5,
        city: 'San Francisco',
        region: 'California',
        country: 'United States',
        address: '500 Howard Street, San Francisco, CA 94105',
        source: 'WIFI_GEOLOCATION',
        lastUpdated: new Date().toISOString(),
      },
      disks: [
        { drive: 'C:', label: 'Windows OS', totalGb: 512, freeGb: 281.6, fs: 'NTFS', smartHealth: 'HEALTHY', type: 'NVMe SSD' },
        { drive: 'D:', label: 'Corporate Data', totalGb: 1024, freeGb: 742.0, fs: 'BitLocker (XTS-AES 256)', smartHealth: 'HEALTHY', type: 'SATA SSD' },
      ],
      thermals: {
        cpuPackageC: cpuTemp,
        gpuCoreC: +(cpuTemp - 4).toFixed(1),
        fanSpeedRpm: 2450,
        throttlingActive: false,
      },
      securityPosture: {
        bitlockerEnabled: true,
        secureBootActive: true,
        defenderEngineVersion: '1.403.2185.0',
        realtimeProtection: true,
        usbStorageRestricted: true,
        firewallProfiles: { domain: true, private: true, public: true },
      },
      liveProcesses: [
        { pid: 1420, name: 'devenv.exe', user: 'SYSTEM\\john.doe', cpuPercent: 14.2, memoryMb: 1240, startTime: '09:00:15' },
        { pid: 8840, name: 'chrome.exe', user: 'SYSTEM\\john.doe', cpuPercent: 8.5, memoryMb: 850, startTime: '09:15:02' },
        { pid: 5120, name: 'teams.exe', user: 'SYSTEM\\john.doe', cpuPercent: 4.1, memoryMb: 620, startTime: '09:01:40' },
        { pid: 9024, name: 'powershell.exe', user: 'SYSTEM\\john.doe', cpuPercent: 0.5, memoryMb: 110, startTime: '10:45:12' },
        { pid: 3200, name: 'slack.exe', user: 'SYSTEM\\john.doe', cpuPercent: 2.3, memoryMb: 410, startTime: '09:05:00' },
        { pid: 1040, name: 'SentinelOpsAgent.exe', user: 'NT AUTHORITY\\SYSTEM', cpuPercent: 0.2, memoryMb: 42, startTime: 'BOOT' },
      ],
    },
  };

  try {
    const res = await makeRequest('/heartbeat/submit', 'POST', payload);
    if (res.status === 201 || res.status === 200) {
      process.stdout.write(`💓 [HEARTBEAT] CPU: ${cpu}%, RAM: ${mem}%, GPS: [37.7749, -122.4194] -> Synced\n`);
    } else {
      console.warn(`⚠️ [HEARTBEAT] Failed with status ${res.status}:`, res.data);
    }
  } catch (err) {
    console.error('❌ [HEARTBEAT] Network error:', err.message);
  }
}

// 2. Send active application telemetry
const activeApps = [
  { proc: 'devenv.exe', title: 'SentinelOps.sln - Visual Studio 2022' },
  { proc: 'chrome.exe', title: 'SentinelOps Dashboard - Google Chrome' },
  { proc: 'teams.exe', title: 'Sprint Review | Microsoft Teams' },
  { proc: 'powershell.exe', title: 'Administrator: Windows PowerShell' },
];

let appIndex = 0;
async function sendActivityTelemetry() {
  const currentApp = activeApps[appIndex % activeApps.length];
  appIndex++;

  const payload = {
    events: [
      {
        activeWindowProcess: currentApp.proc,
        activeWindowTitle: currentApp.title,
        activeDurationSeconds: 30,
        idleDurationSeconds: 0,
        activityState: 'ACTIVE',
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const res = await makeRequest('/usage/submit', 'POST', payload);
    if (res.status === 201 || res.status === 200) {
      console.log(`📊 [TELEMETRY] Foreground App: ${currentApp.proc} ("${currentApp.title}")`);
    }
  } catch (err) {
    console.error('❌ [TELEMETRY] Error:', err.message);
  }
}

// 3. Poll for pending remote commands and execute them
async function pollCommands() {
  try {
    const res = await makeRequest('/remote-actions/poll', 'GET');
    if (res.status === 200 && res.data?.commands?.length > 0) {
      for (const cmd of res.data.commands) {
        console.log(`\n🔔 [REMOTE ACTION DETECTED] Action: ${cmd.actionType} (Command ID: ${cmd.id})`);

        // Simulate local execution
        console.log(`⚙️ [EXECUTING] Invoking system handler for: ${cmd.actionType}...`);
        await new Promise((r) => setTimeout(r, 1200));

        let resultPayload = {
          commandId: cmd.id,
          status: 'COMPLETED',
          result: {
            executedBy: 'SentinelOpsSimulator-Agent',
            executedAt: new Date().toISOString(),
            platform: 'WINDOWS_SIMULATOR',
          },
        };

        if (cmd.actionType === 'LOCK') {
          console.log('🔒 [LOCK] Windows Workstation Lock signal processed successfully!');
          resultPayload.result.lockScreen = 'DISPLAY_OFF';
        } else if (cmd.actionType === 'RESTART') {
          console.log('🔄 [RESTART] Graceful system restart initiated (simulation).');
          resultPayload.result.restartTimer = 30;
        } else if (cmd.actionType === 'REFRESH_INVENTORY') {
          console.log('📦 [INVENTORY] Deep hardware & software scan completed.');
          resultPayload.result.packagesScanned = 52;
        } else if (cmd.actionType === 'KILL_PROCESS') {
          const target = cmd.payload?.processName || cmd.payload?.pid || 'devenv.exe';
          console.log(`🛑 [KILL_PROCESS] Terminated target process: ${target}`);
          resultPayload.result.processTerminated = target;
          resultPayload.result.exitCode = 15; // SIGTERM
        } else if (cmd.actionType === 'SEND_NOTIFICATION') {
          const msg = cmd.payload?.message || 'Corporate Security Notice: Compliance Verification in Progress';
          console.log(`📢 [NOTIFICATION POPUP] Displayed toast message to user: "${msg}"`);
          resultPayload.result.messageDelivered = true;
          resultPayload.result.userAcknowledged = true;
        } else if (cmd.actionType === 'LOCATE_DEVICE') {
          console.log('📍 [LOCATE] Emitting high-precision GPS coordinate beacon.');
          resultPayload.result.beaconCoordinates = { lat: 37.7749, lng: -122.4194, accuracyMeters: 5.0 };
        } else if (cmd.actionType === 'EXECUTE_COMMAND') {
          const shellCmd = (cmd.payload?.command || 'Get-Service SentinelOpsAgent').trim();
          console.log(`💻 [RUN_COMMAND] Executing: ${shellCmd}`);
          resultPayload.result.command = shellCmd;
          if (shellCmd.toLowerCase().includes('ipconfig')) {
            resultPayload.result.stdout = `Windows IP Configuration\n\nEthernet adapter vEthernet (WSL):\n   Connection-specific DNS Suffix  . :\n   IPv4 Address. . . . . . . . . . . : 172.28.16.1\n   Subnet Mask . . . . . . . . . . . : 255.255.240.0\n\nWireless LAN adapter Wi-Fi 6:\n   Connection-specific DNS Suffix  . : corp.internal\n   IPv4 Address. . . . . . . . . . . : 192.168.1.104\n   Subnet Mask . . . . . . . . . . . : 255.255.255.0\n   Default Gateway . . . . . . . . . : 192.168.1.1`;
          } else if (shellCmd.toLowerCase().includes('systeminfo')) {
            resultPayload.result.stdout = `Host Name:                 CORP-W11-JOHN\nOS Name:                   Microsoft Windows 11 Enterprise\nOS Version:                10.0.22631 N/A Build 22631\nSystem Manufacturer:       Dell Inc.\nSystem Model:              Latitude 5440\nTotal Physical Memory:     32,548 MB\nAvailable Physical Memory: 18,290 MB\nNetwork Card(s):           Intel(R) Wi-Fi 6E AX211 160MHz`;
          } else if (shellCmd.toLowerCase().includes('whoami')) {
            resultPayload.result.stdout = 'CORP\\john.doe (Security Identifier: S-1-5-21-3623811015-3361044348-30300820-1013)';
          } else {
            resultPayload.result.stdout = `Status: Running | DisplayName: SentinelOps Enterprise Endpoint Agent | StartType: Automatic\nCommand Output: "${shellCmd}" executed with ExitCode 0`;
          }
        }

        // Report execution outcome back to backend
        const reportRes = await makeRequest('/remote-actions/result', 'POST', resultPayload);
        if (reportRes.status === 200 || reportRes.status === 201) {
          console.log(`✅ [RESULT REPORTED] Status COMPLETED registered on control plane.\n`);
        }
      }
    }
  } catch (err) {
    // Ignore network polling blips
  }
}

// Orchestrator loop
async function runLoop() {
  await sendHeartbeat();
  await sendActivityTelemetry();
  await pollCommands();

  // Heartbeat every 15s, command poll every 5s
  setInterval(sendHeartbeat, 15000);
  setInterval(sendActivityTelemetry, 30000);
  setInterval(pollCommands, 5000);

  console.log('\n🟢 Agent Simulator is active. Leave this running to test live dashboard updates and remote commands.\n');
}

runLoop();
