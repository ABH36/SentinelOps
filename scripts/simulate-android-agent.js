/**
 * SentinelOps Enterprise - Live Android Agent Simulator
 * Simulates a company-owned Google Pixel smartphone running Android 14 (Device Owner mode)
 * reporting mobile telemetry, battery health, cellular connectivity, enterprise app usage,
 * and executing remote security actions (Lock, Reboot, Refresh, Wipe).
 */

const http = require('http');

const API_BASE = process.env.API_URL || 'http://localhost:3001/api';
const DEVICE_KEY = process.env.DEVICE_KEY || '1d18991c94f28e8872840f7372248b1e';
const DEVICE_SECRET = process.env.DEVICE_SECRET || '7f33f740f8650ef862d0e047dda0aec9caf90aae7daf44732ff95b4d76c75805';

console.log('===========================================================');
console.log('📱 SentinelOps Enterprise - Android Agent Simulator');
console.log('Model:          Google Pixel 8 Pro');
console.log('Platform:       Android 14 (Device Owner / DPC)');
console.log('Target API:    ', API_BASE);
console.log('Device Key:    ', DEVICE_KEY);
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

// 1. Android Periodic Heartbeat
async function sendHeartbeat() {
  const battery = +(78 + Math.sin(Date.now() / 60000) * 10).toFixed(0);
  const mem = +(48 + Math.random() * 12).toFixed(1);

  const payload = {
    deviceKey: DEVICE_KEY,
    deviceSecret: DEVICE_SECRET,
    health: {
      cpuUsage: +(10 + Math.random() * 15).toFixed(1),
      memoryUsage: mem,
      diskUsage: 38.5,
      batteryLevel: parseInt(battery, 10),
      batteryStatus: 'Discharging',
      uptime: Math.floor(process.uptime()) + 72000,
    },
    connectivity: {
      isConnected: true,
      connectionType: 'Cellular 5G (Verizon Ultra-Wideband)',
      latency: 14.8,
      networkSpeed: 420,
    },
    agent: {
      status: 'healthy',
      lastCommand: 'none',
      pendingCommands: 0,
    },
    metadata: {
      location: {
        latitude: 37.7833,
        longitude: -122.4167,
        accuracy: 4.2,
        city: 'San Francisco',
        region: 'California',
        country: 'United States',
        address: 'Market St & 4th St, San Francisco, CA 94103',
        source: 'GPS_HARDWARE',
        lastUpdated: new Date().toISOString(),
      },
      disks: [
        { drive: '/data', label: 'Internal Storage', totalGb: 256, freeGb: 157.4, fs: 'f2fs (Hardware AES-256)', smartHealth: 'HEALTHY', type: 'UFS 3.1 Flash' },
      ],
      thermals: {
        batteryTempC: 31.4,
        socTempC: 36.8,
        thermalState: 'NORMAL',
        throttlingActive: false,
      },
      securityPosture: {
        deviceOwnerActive: true,
        playIntegrityPass: true,
        knoxVersion: 'N/A',
        screenLockEnforced: true,
        usbDebuggingDisabled: true,
        developerModeBlocked: true,
      },
      liveProcesses: [
        { pid: 3104, name: 'com.microsoft.teams', user: 'u0_a145', cpuPercent: 3.4, memoryMb: 198, startTime: '08:45:00' },
        { pid: 4210, name: 'com.slack', user: 'u0_a150', cpuPercent: 2.1, memoryMb: 165, startTime: '09:02:10' },
        { pid: 1822, name: 'com.google.android.gm', user: 'u0_a112', cpuPercent: 0.8, memoryMb: 140, startTime: '07:30:15' },
        { pid: 5690, name: 'com.android.chrome', user: 'u0_a98', cpuPercent: 4.2, memoryMb: 245, startTime: '10:14:00' },
        { pid: 820, name: 'com.sentinelops.agent', user: 'system', cpuPercent: 0.1, memoryMb: 38, startTime: 'BOOT' },
      ],
    },
  };

  try {
    const res = await makeRequest('/heartbeat/submit', 'POST', payload);
    if (res.status === 201 || res.status === 200) {
      process.stdout.write(`🔋 [ANDROID HEARTBEAT] Battery: ${battery}%, RAM: ${mem}%, GPS: [37.7833, -122.4167] -> Synced\n`);
    } else {
      console.warn(`⚠️ [ANDROID HEARTBEAT] Failed with status ${res.status}:`, res.data);
    }
  } catch (err) {
    console.error('❌ [ANDROID HEARTBEAT] Network error:', err.message);
  }
}

// 2. Android Enterprise Managed App Usage (UsageStatsManager)
const corporateApps = [
  { pkg: 'com.microsoft.teams', name: 'Microsoft Teams' },
  { pkg: 'com.google.android.gm', name: 'Gmail (Work Profile)' },
  { pkg: 'com.slack', name: 'Slack Enterprise' },
  { pkg: 'com.salesforce.chatter', name: 'Salesforce CRM' },
];

let appIdx = 0;
async function sendAppUsageTelemetry() {
  const currentApp = corporateApps[appIdx % corporateApps.length];
  appIdx++;

  const payload = {
    events: [
      {
        activeWindowProcess: currentApp.pkg,
        activeWindowTitle: currentApp.name,
        activeDurationSeconds: 45,
        idleDurationSeconds: 0,
        activityState: 'ACTIVE',
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const res = await makeRequest('/usage/submit', 'POST', payload);
    if (res.status === 201 || res.status === 200) {
      console.log(`📱 [ANDROID USAGE] Foreground App: ${currentApp.pkg} ("${currentApp.name}")`);
    }
  } catch (err) {
    console.error('❌ [ANDROID USAGE] Error:', err.message);
  }
}

// 3. Android Remote Command Polling & Execution
async function pollCommands() {
  try {
    const res = await makeRequest('/remote-actions/poll', 'GET');
    if (res.status === 200 && res.data?.commands?.length > 0) {
      for (const cmd of res.data.commands) {
        console.log(`\n📲 [ANDROID DPC COMMAND] Action: ${cmd.actionType} (Command ID: ${cmd.id})`);

        let resultPayload = {
          commandId: cmd.id,
          status: 'COMPLETED',
          result: {
            executedBy: 'SentinelOps-Android-DPC',
            executedAt: new Date().toISOString(),
            platform: 'ANDROID_14_DEVICE_OWNER',
          },
        };

        if (cmd.actionType === 'LOCK') {
          console.log('🔒 [DPM.lockNow()] Screen locked instantly. Passcode required.');
          resultPayload.result.dpmAction = 'lockNow_SUCCESS';
        } else if (cmd.actionType === 'RESTART') {
          console.log('🔄 [DPM.reboot()] Device reboot initiated by Device Owner.');
          resultPayload.result.dpmAction = 'reboot_SUCCESS';
        } else if (cmd.actionType === 'REFRESH_INVENTORY') {
          console.log('📦 [PackageManager] Scanned 38 installed packages & security patch level 2026-10-01.');
          resultPayload.result.packagesScanned = 38;
          resultPayload.result.securityPatchLevel = '2026-10-01';
        } else if (cmd.actionType === 'WIPE') {
          console.log('🚨 [DPM.wipeData()] Cryptographic factory wipe executed.');
          resultPayload.result.dpmAction = 'wipeData_SUCCESS';
        } else if (cmd.actionType === 'KILL_PROCESS') {
          const targetPkg = cmd.payload?.processName || 'com.salesforce.chatter';
          console.log(`🛑 [ActivityManager.killBackgroundProcesses] Force-stopped package: ${targetPkg}`);
          resultPayload.result.packageTerminated = targetPkg;
        } else if (cmd.actionType === 'SEND_NOTIFICATION') {
          const msg = cmd.payload?.message || 'IT Security: Immediate Action Required';
          console.log(`🔔 [NotificationManager] Posted high-priority enterprise notification: "${msg}"`);
          resultPayload.result.notificationDelivered = true;
        } else if (cmd.actionType === 'LOCATE_DEVICE') {
          console.log('📍 [FusedLocationProviderClient] Polling GPS satellites for exact fix.');
          resultPayload.result.location = { lat: 37.7833, lng: -122.4167, accuracyMeters: 4.2 };
        } else if (cmd.actionType === 'EXECUTE_COMMAND') {
          const shellCmd = (cmd.payload?.command || '').trim();
          console.log(`💻 [DPC SHELL] Executing: ${shellCmd}`);
          resultPayload.result.command = shellCmd;
          if (shellCmd.toLowerCase().includes('getprop')) {
            resultPayload.result.stdout = `[ro.build.version.release]: [14]\n[ro.build.version.security_patch]: [2026-10-01]\n[ro.product.model]: [Pixel 8 Pro]\n[ro.product.manufacturer]: [Google]\n[ro.boot.hardware]: [husky]\n[ro.boot.flash.locked]: [1]`;
          } else if (shellCmd.toLowerCase().includes('dumpsys battery')) {
            resultPayload.result.stdout = `Current Battery Service state:\n  AC powered: false\n  USB powered: false\n  Wireless powered: false\n  status: 3 (Discharging)\n  health: 2 (Good)\n  present: true\n  level: 74\n  scale: 100\n  voltage: 3950 mV\n  temperature: 312 (31.2°C)\n  technology: Li-ion`;
          } else {
            resultPayload.result.stdout = `[Android DPC Shell Executed]\nCommand: "${shellCmd}"\nExit Code: 0 (Success)\nOutput: DPC enterprise sandbox completed execution successfully.`;
          }
        }

        const reportRes = await makeRequest('/remote-actions/result', 'POST', resultPayload);
        if (reportRes.status === 200 || reportRes.status === 201) {
          console.log(`✅ [ANDROID RESULT] Status COMPLETED reported to control plane.\n`);
        }
      }
    }
  } catch (err) {
    // Ignore network polling blips
  }
}

// 4. Android Hardware & Software Inventory
async function sendInventory() {
  const payload = {
    hardware: {
      manufacturer: 'Google',
      model: 'Pixel 8 Pro',
      serialNumber: '89A019X-DROID',
      cpu: 'Google Tensor G3 (Titan M2 Security)',
      cpuCores: 9,
      ram: 12,
      storage: 256,
    },
    operatingSystem: {
      name: 'Android',
      version: '14',
      build: 'AP1A.240305.019.A1',
      architecture: 'aarch64',
      kernelVersion: '5.15.137-android14-11',
    },
    network: {
      hostname: 'pixel-8-pro-field',
      ipAddress: '10.0.4.88',
      macAddress: '68:DB:F5:2A:81:4C',
      interfaces: [
        { name: 'rmnet_data0', ip: '10.0.4.88', type: 'Cellular 5G' },
        { name: 'wlan0', ip: '192.168.1.112', type: 'Wi-Fi 7' },
      ],
    },
    software: {
      installedApplications: [
        { name: 'Microsoft Teams', version: '1416/1.0.0', publisher: 'Microsoft Corporation' },
        { name: 'Slack', version: '24.03.10.0', publisher: 'Slack Technologies' },
        { name: 'Google Chrome', version: '122.0.6261.94', publisher: 'Google LLC' },
        { name: 'Gmail (Work Profile)', version: '2024.02.18', publisher: 'Google LLC' },
        { name: 'Salesforce', version: '246.040.0', publisher: 'Salesforce.com' },
        { name: 'SentinelOps Agent', version: '1.0.0', publisher: 'SentinelOps Enterprise' },
      ],
    },
    security: {
      antivirus: 'Google Play Protect Active',
      firewallEnabled: true,
      encryptionStatus: 'Encrypted (Hardware KeyStore AES-256)',
    },
    agent: {
      version: '1.0.0-android-dpc',
      status: 'active',
      dpcMode: 'DEVICE_OWNER',
    },
  };

  try {
    const res = await makeRequest('/inventory/submit', 'POST', payload);
    if (res.status === 201 || res.status === 200) {
      console.log('📦 [INVENTORY] Android device hardware & software profile synced to control plane.');
    }
  } catch (err) {
    console.error('❌ [INVENTORY] Failed to sync inventory:', err.message);
  }
}

// Orchestrator loop
async function runLoop() {
  await sendInventory();
  await sendHeartbeat();
  await sendAppUsageTelemetry();
  await pollCommands();

  setInterval(sendHeartbeat, 20000);
  setInterval(sendAppUsageTelemetry, 35000);
  setInterval(pollCommands, 6000);

  console.log('\n🟢 Android Agent Simulator is active. Streaming live mobile telemetry to SentinelOps dashboard.\n');
}

runLoop();
