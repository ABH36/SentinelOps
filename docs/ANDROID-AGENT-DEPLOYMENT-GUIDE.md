# Android Agent Deployment Guide

## Overview

The SentinelOps Android agent operates as a concealed system service with Device Admin/Device Owner privileges. This guide covers deployment methods, security features, and troubleshooting.

---

## Deployment Methods

### Method 1: QR Code Provisioning (Recommended)

**Best for:** Corporate-owned devices, zero-touch deployment

**Steps:**

1. **Generate Provisioning QR Code**
```json
{
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.sentinelops.agent/.admin.SentinelDeviceAdminReceiver",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "https://yourserver.com/sentinelops-agent.apk",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": "SHA256_HASH_OF_APK",
  "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": false,
  "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
    "DEVICE_KEY": "your_device_key",
    "DEVICE_SECRET": "your_device_secret",
    "BACKEND_URL": "https://api.sentinelops.com"
  }
}
```

2. **Factory Reset Device**
   - Settings → System → Reset options → Erase all data

3. **Scan QR Code During Setup**
   - During initial setup wizard
   - Tap screen 6 times to activate QR scanner
   - Scan provisioning QR code

4. **Automatic Installation**
   - Agent downloads and installs automatically
   - Device Owner mode enabled
   - All anti-tamper protections applied

**Advantages:**
- ✅ Full Device Owner privileges
- ✅ No user interaction required
- ✅ All anti-tamper features enabled
- ✅ Scalable for fleet deployment

---

### Method 2: ADB Provisioning (Testing/Development)

**Best for:** Development, testing, POC deployments

**Prerequisites:**
- USB debugging enabled
- Device connected via USB
- ADB installed on workstation

**Steps:**

1. **Install APK**
```bash
adb install sentinelops-agent.apk
```

2. **Set Device Owner**
```bash
# Device must have NO accounts added (no Google account)
adb shell dpm set-device-owner com.sentinelops.agent/.admin.SentinelDeviceAdminReceiver
```

Expected output:
```
Success: Device owner set to package com.sentinelops.agent
Active admin set to component {com.sentinelops.agent/com.sentinelops.agent.admin.SentinelDeviceAdminReceiver}
```

3. **Configure Credentials**
```bash
# Option A: Via environment variables (if agent reads from env)
adb shell setprop debug.sentinelops.device_key "your_device_key"
adb shell setprop debug.sentinelops.device_secret "your_device_secret"

# Option B: Via SecureStorage after first launch
# Credentials will be requested during enrollment flow
```

4. **Reboot Device**
```bash
adb reboot
```

**Limitations:**
- ⚠️ Requires factory reset to remove Device Owner
- ⚠️ ADB debugging must be enabled initially
- ⚠️ Not suitable for production deployment

---

### Method 3: NFC Provisioning (Enterprise)

**Best for:** Large-scale enterprise deployment

**Steps:**

1. **Prepare NFC Tag**
   - Load provisioning data onto NFC tag
   - Same JSON format as QR provisioning

2. **Factory Reset Device**
   - Settings → System → Reset options

3. **Tap NFC During Setup**
   - During initial setup wizard
   - Bring NFC tag near device
   - Agent installs automatically

**Advantages:**
- ✅ Faster than QR scanning
- ✅ Reusable NFC tags
- ✅ Suitable for warehouse provisioning

---

### Method 4: Manual Installation (Device Admin Only)

**Best for:** BYOD scenarios, limited privileges

**Steps:**

1. **Install APK**
   - Download APK from secure distribution
   - Settings → Security → Install unknown apps → Allow

2. **Enable Device Admin**
   - Settings → Security → Device admin apps
   - Enable "System Services"

3. **Grant Permissions**
   - Location, Notifications, Usage Stats
   - Battery optimization exclusion

**Limitations:**
- ⚠️ Limited anti-tamper protections
- ⚠️ User can disable Device Admin
- ⚠️ User can uninstall app
- ⚠️ Factory reset, safe mode NOT blocked

---

## Security Features

### Concealment

✅ **No Launcher Icon**
- App does not appear in app drawer
- Users cannot accidentally open or discover

✅ **Generic Name**
- "System Services" (looks like system app)
- No "SentinelOps" or "MDM" keywords

✅ **Hidden Activity**
- MainActivity not exported (no "Open" button)
- Only accessible via Device Admin settings

### Anti-Tamper (Device Owner Mode)

✅ **Uninstall Prevention**
- User cannot uninstall via Settings
- ADB uninstall blocked
- Requires Device Owner removal (factory reset)

✅ **Factory Reset Prevention**
- Settings factory reset disabled
- Prevents user from removing agent

✅ **Safe Mode Prevention**
- Cannot boot into safe mode
- Agent remains active in all boot modes

✅ **ADB Debugging Prevention**
- Developer options disabled
- ADB access blocked

✅ **Task Manager Protection**
- Cannot force stop via recent apps
- Cannot force stop via Settings

✅ **Battery Optimization Exclusion**
- Background tasks continue reliably
- Agent not killed by battery saver

### Root Detection

✅ **7 Detection Methods**
1. Root management apps (SuperSU, Magisk, etc.)
2. Su binary detection (10+ locations)
3. Busybox detection
4. Build tags (test-keys = unsigned)
5. SELinux permissive mode
6. Dangerous system properties
7. Su command execution test

✅ **Reporting**
- Root detection results logged
- Reported to backend (TODO: TASK-025)
- Device flagged as compromised

---

## Verification

### Check Installation

```bash
# List installed packages
adb shell pm list packages | grep sentinelops
# Expected: package:com.sentinelops.agent

# Check if app is hidden from launcher
adb shell pm list packages -l | grep sentinelops
# Expected: No launcher activity listed

# Check device admin status
adb shell dpm list-owners
# Expected: com.sentinelops.agent
```

### Check Device Owner Status

```bash
# Verify Device Owner
adb shell dumpsys device_policy | grep -A 5 "Device Owner"
# Expected: Component: com.sentinelops.agent/.admin.SentinelDeviceAdminReceiver

# Check user restrictions
adb shell dumpsys device_policy | grep "User restrictions"
# Expected: DISALLOW_FACTORY_RESET, DISALLOW_SAFE_BOOT, DISALLOW_DEBUGGING_FEATURES
```

### Check Anti-Tamper Protections

```bash
# Check uninstall blocked
adb shell dumpsys device_policy | grep "uninstall"
# Expected: setUninstallBlocked: true

# Check battery optimization
adb shell dumpsys deviceidle | grep sentinelops
# Expected: Listed in whitelist

# Check if ADB debugging can be enabled
adb shell settings put global adb_enabled 1
# Expected: Operation not permitted (if DISALLOW_DEBUGGING_FEATURES applied)
```

### Check Background Tasks

```bash
# List WorkManager jobs
adb shell dumpsys jobscheduler | grep sentinelops
# Expected: 3 periodic jobs (heartbeat, usage, commands)

# Check last execution
adb shell dumpsys jobscheduler | grep -A 20 sentinelops
# Expected: Last execution timestamps
```

### Check Logcat Output

```bash
# Filter agent logs
adb logcat | grep "SentinelOps"

# Expected output:
# ✓ SentinelOps Enterprise Android DPC Initialized
# ✓ Root detection: Device appears clean (or indicators listed)
# ✓ Device admin active, applying anti-tamper protections
# ✓ All anti-tamper protections applied successfully
# ✓ Battery optimization already disabled
# ✓ Security hardening complete
```

---

## Troubleshooting

### Device Owner Not Set

**Error:** "Not allowed to set the device owner"

**Causes:**
1. Google account already added to device
2. Multiple user profiles exist
3. Device already has a Device Owner

**Solutions:**
```bash
# Remove all accounts
adb shell pm list users
adb shell pm remove-user <user_id>

# Factory reset
adb shell am broadcast -a android.intent.action.MASTER_CLEAR

# Try again
adb shell dpm set-device-owner com.sentinelops.agent/.admin.SentinelDeviceAdminReceiver
```

### App Not Hidden from Launcher

**Cause:** LAUNCHER intent-filter still present

**Solution:**
```xml
<!-- AndroidManifest.xml - MainActivity should have NO launcher filter -->
<activity
    android:name=".ui.MainActivity"
    android:exported="false">
    <!-- NO intent-filter here -->
</activity>
```

### Anti-Tamper Protections Failed

**Error:** "Some anti-tamper protections failed: 3/5"

**Causes:**
1. Not running as Device Owner (only Device Admin)
2. API level too low (need API 21+ for some features)
3. SecurityException (insufficient permissions)

**Check:**
```bash
# Verify Device Owner mode
adb shell dpm list-owners
# Expected: Device Owner listed

# Check API level
adb shell getprop ro.build.version.sdk
# Expected: ≥21 (Android 5.0+)
```

### Battery Optimization Not Disabled

**Cause:** Permission not granted or API level <23

**Solutions:**
```bash
# Grant via Device Owner policy
adb shell dumpsys deviceidle whitelist +com.sentinelops.agent

# Verify
adb shell dumpsys deviceidle | grep sentinelops
# Expected: Listed in whitelist
```

### Root Detection False Positives

**Scenario:** Clean device flagged as rooted

**Possible Causes:**
- Emulator with root access enabled
- Custom ROM with test-keys
- Developer build with ro.debuggable=1

**Solutions:**
- Ignore specific indicators (e.g., TEST_KEYS on LineageOS)
- Use SafetyNet API for production validation
- Whitelist known clean custom ROMs

### WorkManager Jobs Not Running

**Causes:**
1. Battery optimization enabled
2. Doze mode active
3. Network unavailable

**Check:**
```bash
# Check job scheduler status
adb shell dumpsys jobscheduler | grep sentinelops

# Check battery optimization
adb shell dumpsys deviceidle | grep sentinelops

# Force run job (testing)
adb shell cmd jobscheduler run -f com.sentinelops.agent <job_id>
```

---

## Uninstallation / Device Owner Removal

### Standard Removal (Not Recommended)

```bash
# Disable Device Admin first
adb shell dpm remove-active-admin com.sentinelops.agent/.admin.SentinelDeviceAdminReceiver

# Uninstall
adb uninstall com.sentinelops.agent
```

### Force Removal (Device Owner Stuck)

**Method 1: Factory Reset**
```
Settings → System → Reset options → Erase all data
(Will fail if DISALLOW_FACTORY_RESET applied)
```

**Method 2: Recovery Mode Reset**
```
1. Power off device
2. Boot into recovery mode (varies by device)
   - Google Pixel: Hold Power + Volume Down
   - Samsung: Hold Power + Volume Up + Bixby
3. Select "Wipe data/factory reset"
4. Confirm
```

**Method 3: ADB Factory Reset**
```bash
adb shell am broadcast -a android.intent.action.MASTER_CLEAR
```

---

## Production Deployment Checklist

### Pre-Deployment
- [ ] Build release APK with ProGuard/R8 obfuscation
- [ ] Sign APK with production certificate
- [ ] Generate SHA-256 checksum for QR provisioning
- [ ] Host APK on secure HTTPS server
- [ ] Test QR provisioning on clean device
- [ ] Verify all anti-tamper protections apply
- [ ] Test on multiple Android versions (8.0-14.0)
- [ ] Test on multiple OEMs (Samsung, Xiaomi, OnePlus, etc.)

### Provisioning QR Code
- [ ] Generate QR code with provisioning data
- [ ] Include device credentials (DeviceKey, DeviceSecret)
- [ ] Include backend URL
- [ ] Test QR scanning during setup wizard
- [ ] Print QR codes for warehouse provisioning

### Backend Configuration
- [ ] Device enrollment endpoint ready
- [ ] Telemetry collection endpoint ready
- [ ] Remote command endpoint ready
- [ ] WebSocket gateway configured
- [ ] Device authentication configured

### User Communication
- [ ] Inform employees about monitoring (legal requirement)
- [ ] Provide privacy policy
- [ ] Explain acceptable use policy
- [ ] Document in employee handbook
- [ ] Obtain written consent (where required by law)

### Post-Deployment
- [ ] Verify device appears in backend dashboard
- [ ] Test heartbeat telemetry reception
- [ ] Test remote command execution
- [ ] Verify root detection reporting
- [ ] Monitor battery consumption
- [ ] Check for crash reports

---

## Compliance & Legal

### GDPR/CCPA Requirements

✅ **Transparency:**
- Disclose monitoring to employees
- Provide clear privacy policy
- Explain what data is collected

✅ **Data Access:**
- Allow employees to request their data
- Provide mechanism for data export
- Implement data retention policies

✅ **Consent:**
- Obtain explicit consent (where required)
- Document consent in enrollment process
- Allow consent withdrawal (with consequences)

### Industry Standards

✅ **ISO 27001:**
- Document security controls
- Implement access controls
- Maintain audit logs

✅ **SOC 2:**
- Security, availability, confidentiality
- Monitor and log all access
- Incident response procedures

✅ **NIST CSF:**
- Identify, protect, detect, respond, recover
- Document security framework
- Regular security assessments

---

## Support

### Logs

**Logcat Output:**
```bash
adb logcat | grep -E "SentinelOps|sentinelops"
```

**System Logs:**
```bash
# Device policy logs
adb logcat | grep DevicePolicyManager

# WorkManager logs
adb logcat | grep WorkManager

# Battery optimization logs
adb logcat | grep DeviceIdleController
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Device Owner not set | Accounts exist | Remove all accounts, factory reset |
| App visible in launcher | Wrong manifest | Remove LAUNCHER intent-filter |
| Can uninstall | Not Device Owner | Set as Device Owner via ADB |
| Battery kills app | Optimization enabled | Whitelist app via deviceidle |
| Jobs not running | Doze mode | Use EXPEDITED constraints |
| Root false positive | Emulator/custom ROM | Whitelist or use SafetyNet API |

---

## Advanced Configuration

### Custom Backend URL

**Option 1: Build-time Configuration**
```gradle
// android-agent/app/build.gradle
buildConfigField("String", "BACKEND_URL", "\"https://your-backend.com\"")
```

**Option 2: Provisioning Extras**
```json
"android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
  "BACKEND_URL": "https://your-backend.com"
}
```

### Custom Package Name

**Requires code changes:**
1. Refactor package name in Android Studio
2. Update all references
3. Rebuild and re-sign APK
4. Update provisioning QR codes

### OEM-Specific Configurations

**Samsung Knox:**
- Use Knox SDK for enhanced features
- Knox license required
- Additional anti-tamper capabilities

**Xiaomi MIUI:**
- Whitelist app in battery saver
- Disable "Background restrictions"
- Enable "Autostart"

**OnePlus:**
- Battery optimization → Don't optimize
- Background app control → Allow
- App auto-launch → Enable

---

**Document Version:** 1.0  
**Last Updated:** 2026-10-27  
**Related Tasks:** TASK-024, TASK-018, TASK-013
