# SentinelOps Android Agent (Android Enterprise DPC)

**Document Version:** 1.0.0  
**Target Platform:** Android 10+ (API Level 29–34+)  
**Architecture:** Android Enterprise Device Policy Controller (DPC)  
**Security Framework:** Android KeyStore / StrongBox Hardware Backed Cryptography  

---

## 1. Executive Summary & Android Enterprise Positioning

The SentinelOps Android Agent is a modern, enterprise-grade **Device Policy Controller (DPC)** designed specifically for company-owned Android smartphones (Google Pixel, Samsung Galaxy Enterprise, Zebra, etc.) issued to employees.

Android does not allow generic background services to execute unrestricted administrative actions (such as screen locking, factory wipe, or silent package management). To achieve enterprise-grade control safely and legally, the SentinelOps Android Agent leverages **Android Enterprise Device Administration APIs**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                      SENTINELOPS CONTROL PLANE                         │
│                    (REST API / HTTPS / TLS 1.3)                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ X-Device-Key + X-Device-Secret
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   SENTINELOPS ANDROID DPC AGENT                        │
├────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────┐  ┌───────────────────────────────────────┐  │
│  │ SentinelDeviceAdmin   │  │ Hardware KeyStore / EncryptedPrefs    │  │
│  │ Receiver (DPC Core)   │  │ (Device Key & Secret Protection)      │  │
│  └───────────┬───────────┘  └───────────────────┬───────────────────┘  │
│              │                                  │                      │
│  ┌───────────▼───────────┐  ┌───────────────────▼───────────────────┐  │
│  │ DevicePolicyManager   │  │ Jetpack WorkManager                   │  │
│  │ - lockNow()           │  │ - Periodic HeartbeatWorker            │  │
│  │ - wipeData()          │  │ - CommandPollWorker                   │  │
│  │ - setPasswordQuality()│  │ - UsageTelemetryWorker                │  │
│  └───────────────────────┘  └───────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ UsageStatsManager (Corporate App Duration & Active Windows)      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Management Modes: Device Owner vs. Work Profile

SentinelOps supports both standard enterprise deployment models:

### 2.1 Fully Managed Device (Device Owner - DO)
- **Use Case:** Company-purchased smartphones issued exclusively for work duties.
- **Privilege Level:** Highest device privilege (`DevicePolicyManager.isDeviceOwnerApp()`).
- **Capabilities:**
  - Enforce mandatory screen lock complexity (PIN, password, biometrics).
  - Execute instantaneous hardware lock (`lockNow()`).
  - Perform cryptographic factory wipe (`wipeData()`) in case of loss or theft.
  - Disable factory reset from recovery or bootloader (FRP prevention).
  - Monitor installed application versions and device health.
  - Track active corporate application usage.

### 2.2 Work Profile (Profile Owner - PO)
- **Use Case:** Corporate-owned devices with personal usage allowed, or BYOD.
- **Privacy Boundary:** Strong cryptographic isolation between Personal Profile and Work Profile.
- **Privacy Assurance:** The company **cannot** see personal apps, personal photos, personal browsing history, or personal SMS. SentinelOps only monitors and manages the encrypted Work Container.

---

## 3. Zero-Touch & QR Code Enrollment Workflow

Enrollment is streamlined for IT administrators and end users:

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ Factory Reset / │ 6-Tap │ Scan QR Code    │ Wi-Fi │ Automated APK   │
│ Out-of-Box Phone├──────►│ from Admin Hub  ├──────►│ Download &      │
│ Welcome Screen  │       │ (/enrollment)   │       │ DPC Provisioning│
└─────────────────┘       └─────────────────┘       └────────┬────────┘
                                                             │
                                                             ▼
                                                    ┌─────────────────┐
                                                    │ Device Bound to │
                                                    │ SentinelOps Hub │
                                                    │ With Encrypted  │
                                                    │ Hardware Keys   │
                                                    └─────────────────┘
```

### QR Code Provisioning Payload (NFC / QR / Zero-Touch)
The QR code generated in the SentinelOps Web Console (`/enrollment`) contains a standardized JSON payload conforming to Google Android Enterprise specification:

```json
{
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.sentinelops.agent/com.sentinelops.agent.admin.SentinelDeviceAdminReceiver",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "https://download.sentinelops.com/android/sentinelops-agent-release.apk",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM": "4a72d3f...sha256_checksum...",
  "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
    "serverUrl": "https://api.sentinelops.com/api",
    "enrollmentToken": "tkn_sec_a7f98b2c4e10",
    "tenantId": "c5264d88-a4ca-4973-a953-b71cc7a7291f"
  }
}
```

Upon scanning, Android's setup wizard:
1. Downloads the SentinelOps APK.
2. Verifies the SHA-256 package checksum.
3. Automatically sets `SentinelDeviceAdminReceiver` as the **Device Owner**.
4. Delivers the `ADMIN_EXTRAS_BUNDLE` to `onProfileProvisioningComplete()`.
5. The agent generates a local hardware keypair via Android KeyStore, calls `POST /enrollment/register`, and receives permanent `X-Device-Key` and `X-Device-Secret` credentials.

---

## 4. Key Capabilities & Technical Implementation

### 4.1 Telemetry & Health Monitoring (`HeartbeatWorker`)
- Built on Android Jetpack **WorkManager** to ensure execution even across Doze mode and OS power-saving states.
- Collects:
  - Battery percentage, thermal status, charging state (AC / Wireless / USB).
  - Storage utilization (Internal flash available vs. total).
  - RAM consumption (`ActivityManager.MemoryInfo`).
  - Network state (Cellular 5G/4G, Wi-Fi SSID, Signal strength dBm).
- Posts periodically (default: 15–30 minutes) to `/heartbeat/submit`.

### 4.2 Application Activity & Productivity Telemetry (`UsageStatsManager`)
- Utilizes the Android Enterprise `UsageStatsManager.queryUsageStats()` API.
- Measures foreground duration for corporate-approved packages.
- Calculates total daily screen-on time vs. idle periods.
- Batches metrics and cryptographically signs payloads before transmitting to `/usage/submit`.
- **Privacy Safeguard:** Window content, keyboard inputs, keystrokes, and camera feeds are **never** captured, in strict compliance with GDPR Article 5 and labor laws.

### 4.3 Remote Command Execution (`CommandWorker`)
- Supports immediate and polled command execution:
  - **`LOCK`**: Calls `DevicePolicyManager.lockNow()`. Instantly puts the screen to sleep and requires the enterprise passcode to unlock.
  - **`RESTART`**: Calls `DevicePolicyManager.reboot()` (Device Owner mode).
  - **`REFRESH_INVENTORY`**: Scans package manager for installed apps, OS security patch level, and hardware identifiers.
  - **`WIPE`**: Calls `DevicePolicyManager.wipeData(WIPE_EXTERNAL_STORAGE)`. Triggered only when dual-control approval is verified by two administrators.

---

## 5. Security & Tamper Resistance

1. **Hardware-Backed Credential Storage:**  
   Device credentials (`X-Device-Key`, `X-Device-Secret`) are encrypted using `EncryptedSharedPreferences` backed by AES-256-GCM and the Android hardware **KeyStore** (utilizing StrongBox Keymaster where available on modern chips).
2. **Uninstall Prevention:**  
   In Device Owner mode, the application package `com.sentinelops.agent` is protected via `DevicePolicyManager.setUninstallBlocked()`. Users cannot uninstall the agent or disable admin rights without IT authorization.
3. **SafetyNet / Play Integrity Attestation:**  
   The agent queries Google Play Integrity API to detect rooted devices, unlocked bootloaders, or custom ROMs, automatically raising a `COMPLIANCE_VIOLATION` alert in the SentinelOps dashboard.
