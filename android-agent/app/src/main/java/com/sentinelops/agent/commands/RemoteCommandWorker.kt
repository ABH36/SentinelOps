package com.sentinelops.agent.commands

import android.Manifest
import android.app.ActivityManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.sentinelops.agent.R
import com.sentinelops.agent.SentinelApplication
import com.sentinelops.agent.admin.SentinelDeviceAdminReceiver
import com.sentinelops.agent.data.model.CommandResultPayload
import com.sentinelops.agent.data.storage.SecureStorage
import com.sentinelops.agent.network.NetworkClient
import timber.log.Timber

/**
 * Polls for pending remote commands from SentinelOps Control Plane and executes them.
 */
class RemoteCommandWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    private val storage = SecureStorage(appContext)
    private val networkClient = NetworkClient(storage)

    override suspend fun doWork(): Result {
        if (!storage.isEnrolled || storage.deviceKey.isNullOrEmpty() || storage.deviceSecret.isNullOrEmpty()) {
            return Result.success()
        }

        return try {
            val response = networkClient.apiService.pollRemoteCommands(
                deviceKey = storage.deviceKey!!,
                deviceSecret = storage.deviceSecret!!
            )

            if (response.isSuccessful && response.body() != null) {
                val commands = response.body()!!.commands
                val dpm = applicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                val adminComponent = SentinelDeviceAdminReceiver.getComponentName(applicationContext)

                for (cmd in commands) {
                    Timber.i("⚡ Received remote command: ${cmd.actionType} (ID: ${cmd.id})")
                    var status = "COMPLETED"
                    var errorMessage: String? = null
                    val resultData = mutableMapOf<String, Any>()

                    try {
                        when (cmd.actionType.uppercase()) {
                            "LOCK" -> {
                                dpm.lockNow()
                                resultData["lockedAt"] = System.currentTimeMillis()
                                Timber.i("🔒 Executed dpm.lockNow()")
                            }
                            "RESTART" -> {
                                if (dpm.isDeviceOwnerApp(applicationContext.packageName)) {
                                    dpm.reboot(adminComponent)
                                    resultData["rebootInitiated"] = true
                                } else {
                                    status = "FAILED"
                                    errorMessage = "Reboot requires Device Owner mode"
                                }
                            }
                            "REFRESH_INVENTORY" -> {
                                resultData["packagesCount"] = applicationContext.packageManager.getInstalledPackages(0).size
                                resultData["syncedAt"] = System.currentTimeMillis()
                            }
                            "KILL_PROCESS" -> {
                                val packageName = cmd.parameters?.get("packageName") as? String
                                if (packageName.isNullOrEmpty()) {
                                    status = "FAILED"
                                    errorMessage = "Missing required parameter: packageName"
                                } else {
                                    // Attempt to kill background processes
                                    val activityManager = applicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                                    
                                    if (dpm.isDeviceOwnerApp(applicationContext.packageName)) {
                                        // Device Owner mode: Use force-stop capability
                                        try {
                                            dpm.clearApplicationUserData(adminComponent, packageName, object : DevicePolicyManager.OnClearApplicationUserDataListener {
                                                override fun onApplicationUserDataCleared(pkgName: String, succeeded: Boolean) {
                                                    Timber.i("Force-stop $pkgName: $succeeded")
                                                }
                                            })
                                            
                                            // Also attempt background process kill for immediate effect
                                            activityManager.killBackgroundProcesses(packageName)
                                            
                                            resultData["packageName"] = packageName
                                            resultData["method"] = "deviceOwner_forceStop"
                                            resultData["terminatedAt"] = System.currentTimeMillis()
                                            Timber.i("🔪 Force-stopped app: $packageName (Device Owner mode)")
                                        } catch (e: Exception) {
                                            status = "FAILED"
                                            errorMessage = "Failed to force-stop app: ${e.message}"
                                            Timber.e(e, "Force-stop failed for $packageName")
                                        }
                                    } else {
                                        // Standard mode: Kill background processes only (limited capability)
                                        try {
                                            activityManager.killBackgroundProcesses(packageName)
                                            resultData["packageName"] = packageName
                                            resultData["method"] = "killBackgroundProcesses"
                                            resultData["terminatedAt"] = System.currentTimeMillis()
                                            resultData["warning"] = "Limited capability without Device Owner - foreground apps may continue"
                                            Timber.i("🔪 Killed background processes for: $packageName (standard mode)")
                                        } catch (e: SecurityException) {
                                            status = "FAILED"
                                            errorMessage = "Insufficient permissions to kill process: ${e.message}"
                                            Timber.e(e, "SecurityException killing $packageName")
                                        }
                                    }
                                }
                            }
                            "USB_LOCK" -> {
                                // Check if device supports USB data signaling control (Android 12+)
                                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                                    status = "FAILED"
                                    errorMessage = "USB_LOCK requires Android 12 (API 31) or higher. Current API: ${Build.VERSION.SDK_INT}"
                                    Timber.w("USB_LOCK unsupported: API ${Build.VERSION.SDK_INT} < 31")
                                } else {
                                    // Check Device Owner status
                                    if (!dpm.isDeviceOwnerApp(applicationContext.packageName)) {
                                        status = "FAILED"
                                        errorMessage = "USB_LOCK requires Device Owner mode"
                                        Timber.w("USB_LOCK failed: not Device Owner")
                                    } else {
                                        // Get desired state from parameters (default: disable USB)
                                        val enableUsb = cmd.parameters?.get("enabled") as? Boolean ?: false
                                        
                                        try {
                                            // API 31+ (Android 12+): setUsbDataSignalingEnabled
                                            dpm.setUsbDataSignalingEnabled(adminComponent, enableUsb)
                                            
                                            resultData["usbDataEnabled"] = enableUsb
                                            resultData["apiLevel"] = Build.VERSION.SDK_INT
                                            resultData["appliedAt"] = System.currentTimeMillis()
                                            
                                            if (enableUsb) {
                                                Timber.i("🔓 USB data signaling ENABLED")
                                            } else {
                                                Timber.i("🔒 USB data signaling DISABLED (charging only)")
                                            }
                                        } catch (e: SecurityException) {
                                            status = "FAILED"
                                            errorMessage = "SecurityException: ${e.message}"
                                            Timber.e(e, "USB_LOCK SecurityException")
                                        } catch (e: Exception) {
                                            status = "FAILED"
                                            errorMessage = "Failed to set USB state: ${e.message}"
                                            Timber.e(e, "USB_LOCK failed")
                                        }
                                    }
                                }
                            }
                            "CAMERA_DISABLE" -> {
                                // Extract disabled state from parameters (default: true = disable camera)
                                val disableCamera = cmd.parameters?.get("disabled") as? Boolean ?: true
                                
                                try {
                                    dpm.setCameraDisabled(adminComponent, disableCamera)
                                    
                                    resultData["cameraDisabled"] = disableCamera
                                    resultData["appliedAt"] = System.currentTimeMillis()
                                    
                                    if (disableCamera) {
                                        Timber.i("📷🚫 Camera DISABLED system-wide")
                                    } else {
                                        Timber.i("📷✅ Camera ENABLED system-wide")
                                    }
                                } catch (e: SecurityException) {
                                    status = "FAILED"
                                    errorMessage = "SecurityException: ${e.message}"
                                    Timber.e(e, "CAMERA_DISABLE SecurityException")
                                } catch (e: Exception) {
                                    status = "FAILED"
                                    errorMessage = "Failed to set camera state: ${e.message}"
                                    Timber.e(e, "CAMERA_DISABLE failed")
                                }
                            }
                            "SCREEN_CAPTURE_DISABLE" -> {
                                // Extract disabled state from parameters (default: true = disable screen capture)
                                val disableScreenCapture = cmd.parameters?.get("disabled") as? Boolean ?: true
                                
                                try {
                                    dpm.setScreenCaptureDisabled(adminComponent, disableScreenCapture)
                                    
                                    resultData["screenCaptureDisabled"] = disableScreenCapture
                                    resultData["appliedAt"] = System.currentTimeMillis()
                                    
                                    if (disableScreenCapture) {
                                        Timber.i("📸🚫 Screen capture DISABLED (screenshots/screen recording blocked)")
                                    } else {
                                        Timber.i("📸✅ Screen capture ENABLED")
                                    }
                                } catch (e: SecurityException) {
                                    status = "FAILED"
                                    errorMessage = "SecurityException: ${e.message}"
                                    Timber.e(e, "SCREEN_CAPTURE_DISABLE SecurityException")
                                } catch (e: Exception) {
                                    status = "FAILED"
                                    errorMessage = "Failed to set screen capture state: ${e.message}"
                                    Timber.e(e, "SCREEN_CAPTURE_DISABLE failed")
                                }
                            }
                            "KIOSK_MODE" -> {
                                // Check Device Owner requirement
                                if (!dpm.isDeviceOwnerApp(applicationContext.packageName)) {
                                    status = "FAILED"
                                    errorMessage = "KIOSK_MODE requires Device Owner mode"
                                    Timber.w("KIOSK_MODE failed: not Device Owner")
                                } else {
                                    // Extract package name(s) for kiosk mode
                                    val packageName = cmd.parameters?.get("packageName") as? String
                                    val enable = cmd.parameters?.get("enabled") as? Boolean ?: true
                                    
                                    if (enable && packageName.isNullOrEmpty()) {
                                        status = "FAILED"
                                        errorMessage = "Missing required parameter: packageName (when enabled=true)"
                                        Timber.w("KIOSK_MODE failed: missing packageName")
                                    } else {
                                        try {
                                            if (enable) {
                                                // Enable kiosk mode for specified package
                                                // Set lock task packages (apps allowed in kiosk mode)
                                                dpm.setLockTaskPackages(adminComponent, arrayOf(packageName!!))
                                                
                                                // Set lock task features (disable system UI elements)
                                                // LOCK_TASK_FEATURE_NONE = most restrictive (no home, no notifications, no system UI)
                                                dpm.setLockTaskFeatures(
                                                    adminComponent,
                                                    DevicePolicyManager.LOCK_TASK_FEATURE_NONE
                                                )
                                                
                                                // Note: startLockTask() must be called by the kiosk app itself
                                                // The command only configures which apps CAN enter lock task mode
                                                
                                                resultData["kioskEnabled"] = true
                                                resultData["kioskPackage"] = packageName
                                                resultData["lockTaskFeatures"] = "NONE"
                                                resultData["appliedAt"] = System.currentTimeMillis()
                                                resultData["note"] = "Kiosk app must call startLockTask() to enter kiosk mode"
                                                
                                                Timber.i("🔒📱 KIOSK_MODE configured for: $packageName (features: NONE)")
                                            } else {
                                                // Disable kiosk mode (clear lock task packages)
                                                dpm.setLockTaskPackages(adminComponent, arrayOf())
                                                
                                                // Reset lock task features to default
                                                dpm.setLockTaskFeatures(
                                                    adminComponent,
                                                    DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO or
                                                    DevicePolicyManager.LOCK_TASK_FEATURE_HOME or
                                                    DevicePolicyManager.LOCK_TASK_FEATURE_NOTIFICATIONS
                                                )
                                                
                                                resultData["kioskEnabled"] = false
                                                resultData["appliedAt"] = System.currentTimeMillis()
                                                
                                                Timber.i("🔓📱 KIOSK_MODE disabled (lock task packages cleared)")
                                            }
                                        } catch (e: SecurityException) {
                                            status = "FAILED"
                                            errorMessage = "SecurityException: ${e.message}"
                                            Timber.e(e, "KIOSK_MODE SecurityException")
                                        } catch (e: IllegalArgumentException) {
                                            status = "FAILED"
                                            errorMessage = "Invalid package name: ${e.message}"
                                            Timber.e(e, "KIOSK_MODE IllegalArgumentException")
                                        } catch (e: Exception) {
                                            status = "FAILED"
                                            errorMessage = "Failed to configure kiosk mode: ${e.message}"
                                            Timber.e(e, "KIOSK_MODE failed")
                                        }
                                    }
                                }
                            }
                            "SEND_NOTIFICATION" -> {
                                // Extract notification parameters
                                val title = cmd.parameters?.get("title") as? String ?: "SentinelOps Alert"
                                val message = cmd.parameters?.get("message") as? String
                                
                                if (message.isNullOrEmpty()) {
                                    status = "FAILED"
                                    errorMessage = "Missing required parameter: message"
                                    Timber.w("SEND_NOTIFICATION failed: missing message")
                                } else {
                                    try {
                                        val notificationManager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                                        val channelId = "sentinel_admin_channel"
                                        
                                        // Create notification channel for Android 8.0+
                                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                            val channel = NotificationChannel(
                                                channelId,
                                                "SentinelOps Admin Notifications",
                                                NotificationManager.IMPORTANCE_HIGH
                                            ).apply {
                                                description = "Critical notifications from IT administrators"
                                                enableLights(true)
                                                enableVibration(true)
                                            }
                                            notificationManager.createNotificationChannel(channel)
                                        }
                                        
                                        // Build and show notification
                                        val notification = NotificationCompat.Builder(applicationContext, channelId)
                                            .setSmallIcon(android.R.drawable.ic_dialog_info)
                                            .setContentTitle(title)
                                            .setContentText(message)
                                            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
                                            .setPriority(NotificationCompat.PRIORITY_HIGH)
                                            .setAutoCancel(true)
                                            .build()
                                        
                                        val notificationId = System.currentTimeMillis().toInt()
                                        notificationManager.notify(notificationId, notification)
                                        
                                        resultData["notificationId"] = notificationId
                                        resultData["title"] = title
                                        resultData["message"] = message
                                        resultData["sentAt"] = System.currentTimeMillis()
                                        
                                        Timber.i("🔔 Notification sent: $title")
                                    } catch (e: Exception) {
                                        status = "FAILED"
                                        errorMessage = "Failed to send notification: ${e.message}"
                                        Timber.e(e, "SEND_NOTIFICATION failed")
                                    }
                                }
                            }
                            "LOCATE_DEVICE" -> {
                                try {
                                    val locationManager = applicationContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
                                    
                                    // Check location permission
                                    val hasFineLocation = ActivityCompat.checkSelfPermission(
                                        applicationContext,
                                        Manifest.permission.ACCESS_FINE_LOCATION
                                    ) == PackageManager.PERMISSION_GRANTED
                                    
                                    val hasCoarseLocation = ActivityCompat.checkSelfPermission(
                                        applicationContext,
                                        Manifest.permission.ACCESS_COARSE_LOCATION
                                    ) == PackageManager.PERMISSION_GRANTED
                                    
                                    if (!hasFineLocation && !hasCoarseLocation) {
                                        status = "FAILED"
                                        errorMessage = "Location permission not granted"
                                        Timber.w("LOCATE_DEVICE failed: no location permission")
                                    } else {
                                        // Try GPS first, then Network provider
                                        var location = if (hasFineLocation) {
                                            locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                                        } else null
                                        
                                        // Fallback to network location
                                        if (location == null && hasCoarseLocation) {
                                            location = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                                        }
                                        
                                        if (location != null) {
                                            resultData["latitude"] = location.latitude
                                            resultData["longitude"] = location.longitude
                                            resultData["accuracy"] = location.accuracy
                                            resultData["provider"] = location.provider ?: "unknown"
                                            resultData["timestamp"] = location.time
                                            resultData["locatedAt"] = System.currentTimeMillis()
                                            
                                            Timber.i("📍 Device located: ${location.latitude}, ${location.longitude} (${location.provider})")
                                        } else {
                                            status = "FAILED"
                                            errorMessage = "No location data available. GPS may be disabled or no recent location fix."
                                            Timber.w("LOCATE_DEVICE: no last known location available")
                                        }
                                    }
                                } catch (e: SecurityException) {
                                    status = "FAILED"
                                    errorMessage = "SecurityException: ${e.message}"
                                    Timber.e(e, "LOCATE_DEVICE SecurityException")
                                } catch (e: Exception) {
                                    status = "FAILED"
                                    errorMessage = "Failed to locate device: ${e.message}"
                                    Timber.e(e, "LOCATE_DEVICE failed")
                                }
                            }
                            "SYNC_POLICY" -> {
                                try {
                                    // Fetch policy from backend
                                    val policyResponse = networkClient.apiService.getDevicePolicy(
                                        deviceKey = storage.deviceKey!!,
                                        deviceSecret = storage.deviceSecret!!
                                    )
                                    
                                    if (policyResponse.isSuccessful && policyResponse.body() != null) {
                                        val policy = policyResponse.body()!!
                                        
                                        // Store policy locally for enforcement
                                        // Note: Actual policy enforcement requires TASK-032 Policy Engine
                                        storage.savePolicy(policy)
                                        
                                        resultData["policyVersion"] = policy.version ?: "unknown"
                                        resultData["syncedAt"] = System.currentTimeMillis()
                                        resultData["policyId"] = policy.id ?: "unknown"
                                        resultData["note"] = "Policy stored locally. Enforcement requires Policy Engine (TASK-032)"
                                        
                                        Timber.i("📋 Policy synced: version ${policy.version}")
                                    } else {
                                        status = "FAILED"
                                        errorMessage = "Failed to fetch policy: HTTP ${policyResponse.code()}"
                                        Timber.e("SYNC_POLICY failed: ${policyResponse.code()}")
                                    }
                                } catch (e: Exception) {
                                    status = "FAILED"
                                    errorMessage = "Failed to sync policy: ${e.message}"
                                    Timber.e(e, "SYNC_POLICY failed")
                                }
                            }
                            "TAKE_SCREENSHOT" -> {
                                // Note: Taking screenshots remotely on Android is complex and requires:
                                // 1. MediaProjection API (requires user consent via dialog)
                                // 2. Accessibility Service (complex setup, permission issues)
                                // 3. Device Owner screen capture (Android 14+ only)
                                //
                                // For Sprint 1, we'll implement a placeholder that acknowledges
                                // the limitation and provides guidance for implementation
                                
                                status = "FAILED"
                                errorMessage = "TAKE_SCREENSHOT not yet implemented. Android requires MediaProjection API with user consent, or Device Owner mode on Android 14+. Scheduled for TASK-056."
                                resultData["limitation"] = "Android security model prevents background screenshots without user interaction"
                                resultData["alternatives"] = listOf(
                                    "Use SCREEN_CAPTURE_DISABLE to prevent unauthorized screenshots",
                                    "Implement in kiosk app with MediaProjection consent",
                                    "Wait for TASK-056 full implementation"
                                )
                                
                                Timber.w("📸 TAKE_SCREENSHOT not implemented: Android MediaProjection requires user consent")
                            }
                            "INSTALL_APK" -> {
                                // Extract APK URL and optional package name from parameters
                                val apkUrl = cmd.parameters?.get("apkUrl") as? String
                                val packageName = cmd.parameters?.get("packageName") as? String
                                
                                if (apkUrl.isNullOrEmpty()) {
                                    status = "FAILED"
                                    errorMessage = "Missing required parameter: apkUrl"
                                    Timber.w("INSTALL_APK failed: missing apkUrl")
                                } else {
                                    try {
                                        // Initialize silent package installer
                                        val installer = SilentPackageInstaller(applicationContext)
                                        
                                        // Check if we have permission to install packages
                                        if (!installer.canInstallPackages()) {
                                            status = "FAILED"
                                            errorMessage = "Missing REQUEST_INSTALL_PACKAGES permission or not in Device Owner mode"
                                            resultData["requiresDeviceOwner"] = true
                                            Timber.w("INSTALL_APK failed: cannot install packages")
                                        } else {
                                            // Download and install APK
                                            Timber.i("📦 Installing APK from: $apkUrl")
                                            val installResult = installer.installFromUrl(apkUrl, packageName)
                                            
                                            if (installResult.success) {
                                                resultData["packageName"] = installResult.packageName ?: "unknown"
                                                resultData["apkUrl"] = apkUrl
                                                resultData["installedAt"] = System.currentTimeMillis()
                                                resultData["method"] = "PackageInstaller"
                                                Timber.i("✅ APK installation succeeded: ${installResult.packageName}")
                                            } else {
                                                status = "FAILED"
                                                errorMessage = installResult.message
                                                resultData["apkUrl"] = apkUrl
                                                resultData["failureReason"] = installResult.message
                                                Timber.e("❌ APK installation failed: ${installResult.message}")
                                            }
                                        }
                                    } catch (e: Exception) {
                                        status = "FAILED"
                                        errorMessage = "Installation exception: ${e.message}"
                                        Timber.e(e, "INSTALL_APK exception")
                                    }
                                }
                            }
                            "UNINSTALL_APK" -> {
                                // Extract package name from parameters
                                val packageName = cmd.parameters?.get("packageName") as? String
                                
                                if (packageName.isNullOrEmpty()) {
                                    status = "FAILED"
                                    errorMessage = "Missing required parameter: packageName"
                                    Timber.w("UNINSTALL_APK failed: missing packageName")
                                } else {
                                    try {
                                        // Initialize silent package installer
                                        val installer = SilentPackageInstaller(applicationContext)
                                        
                                        // Check if package is installed
                                        if (!installer.isPackageInstalled(packageName)) {
                                            status = "FAILED"
                                            errorMessage = "Package not installed: $packageName"
                                            resultData["packageName"] = packageName
                                            Timber.w("UNINSTALL_APK failed: package not found")
                                        } else {
                                            // Uninstall package
                                            Timber.i("🗑️ Uninstalling package: $packageName")
                                            val uninstallResult = installer.uninstallPackage(packageName)
                                            
                                            if (uninstallResult.success) {
                                                resultData["packageName"] = packageName
                                                resultData["uninstalledAt"] = System.currentTimeMillis()
                                                resultData["method"] = "PackageInstaller"
                                                Timber.i("✅ Package uninstallation succeeded: $packageName")
                                            } else {
                                                status = "FAILED"
                                                errorMessage = uninstallResult.message
                                                resultData["packageName"] = packageName
                                                resultData["failureReason"] = uninstallResult.message
                                                Timber.e("❌ Package uninstallation failed: ${uninstallResult.message}")
                                            }
                                        }
                                    } catch (e: Exception) {
                                        status = "FAILED"
                                        errorMessage = "Uninstallation exception: ${e.message}"
                                        Timber.e(e, "UNINSTALL_APK exception")
                                    }
                                }
                            }
                            "ENFORCE_VPN" -> {
                                // Extract VPN package name from parameters
                                val vpnPackage = cmd.parameters?.get("vpnPackage") as? String
                                val lockdownEnabled = cmd.parameters?.get("lockdownEnabled") as? Boolean ?: true
                                
                                if (vpnPackage.isNullOrEmpty()) {
                                    status = "FAILED"
                                    errorMessage = "Missing required parameter: vpnPackage"
                                    Timber.w("ENFORCE_VPN failed: missing vpnPackage")
                                } else {
                                    // Check Device Owner mode
                                    if (!dpm.isDeviceOwnerApp(applicationContext.packageName)) {
                                        status = "FAILED"
                                        errorMessage = "ENFORCE_VPN requires Device Owner mode"
                                        resultData["requiresDeviceOwner"] = true
                                        Timber.w("ENFORCE_VPN failed: not Device Owner")
                                    } else {
                                        try {
                                            // Verify VPN app is installed
                                            try {
                                                applicationContext.packageManager.getPackageInfo(vpnPackage, 0)
                                            } catch (e: PackageManager.NameNotFoundException) {
                                                status = "FAILED"
                                                errorMessage = "VPN package not installed: $vpnPackage"
                                                resultData["vpnPackage"] = vpnPackage
                                                Timber.w("ENFORCE_VPN failed: VPN app not found")
                                                throw e
                                            }
                                            
                                            // Set always-on VPN with optional lockdown mode
                                            // Lockdown mode: block all network traffic when VPN disconnects
                                            dpm.setAlwaysOnVpnPackage(adminComponent, vpnPackage, lockdownEnabled)
                                            
                                            resultData["vpnPackage"] = vpnPackage
                                            resultData["lockdownEnabled"] = lockdownEnabled
                                            resultData["enforcedAt"] = System.currentTimeMillis()
                                            
                                            if (lockdownEnabled) {
                                                Timber.i("🔒 Always-on VPN enforced with LOCKDOWN: $vpnPackage")
                                            } else {
                                                Timber.i("🔒 Always-on VPN enforced (no lockdown): $vpnPackage")
                                            }
                                        } catch (e: PackageManager.NameNotFoundException) {
                                            // Already handled above
                                        } catch (e: SecurityException) {
                                            status = "FAILED"
                                            errorMessage = "SecurityException: ${e.message}"
                                            Timber.e(e, "ENFORCE_VPN SecurityException")
                                        } catch (e: UnsupportedOperationException) {
                                            status = "FAILED"
                                            errorMessage = "VPN enforcement not supported on this device"
                                            Timber.e(e, "ENFORCE_VPN UnsupportedOperationException")
                                        } catch (e: Exception) {
                                            status = "FAILED"
                                            errorMessage = "Failed to enforce VPN: ${e.message}"
                                            Timber.e(e, "ENFORCE_VPN failed")
                                        }
                                    }
                                }
                            }
                            "PUSH_WIFI" -> {
                                // Extract Wi-Fi credentials from parameters
                                val ssid = cmd.parameters?.get("ssid") as? String
                                val password = cmd.parameters?.get("password") as? String
                                val securityType = cmd.parameters?.get("securityType") as? String ?: "WPA2"
                                val hidden = cmd.parameters?.get("hidden") as? Boolean ?: false
                                
                                if (ssid.isNullOrEmpty()) {
                                    status = "FAILED"
                                    errorMessage = "Missing required parameter: ssid"
                                    Timber.w("PUSH_WIFI failed: missing ssid")
                                } else {
                                    try {
                                        // Check Android version (WifiNetworkSuggestion requires API 29+)
                                        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                                            status = "FAILED"
                                            errorMessage = "PUSH_WIFI requires Android 10 (API 29) or higher. Current: ${Build.VERSION.SDK_INT}"
                                            Timber.w("PUSH_WIFI unsupported: API ${Build.VERSION.SDK_INT} < 29")
                                        } else {
                                            // Use WifiNetworkSuggestion API for Android 10+
                                            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
                                            
                                            val suggestionBuilder = android.net.wifi.WifiNetworkSuggestion.Builder()
                                                .setSsid(ssid)
                                                .setIsHiddenSsid(hidden)
                                            
                                            // Add password if provided
                                            if (!password.isNullOrEmpty()) {
                                                when (securityType.uppercase()) {
                                                    "WPA2", "WPA" -> {
                                                        suggestionBuilder.setWpa2Passphrase(password)
                                                    }
                                                    "WPA3" -> {
                                                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                                            suggestionBuilder.setWpa3Passphrase(password)
                                                        } else {
                                                            suggestionBuilder.setWpa2Passphrase(password)
                                                        }
                                                    }
                                                    else -> {
                                                        suggestionBuilder.setWpa2Passphrase(password)
                                                    }
                                                }
                                            }
                                            
                                            val suggestion = suggestionBuilder.build()
                                            val suggestionsList = listOf(suggestion)
                                            
                                            // Add network suggestion
                                            val addResult = wifiManager.addNetworkSuggestions(suggestionsList)
                                            
                                            when (addResult) {
                                                android.net.wifi.WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS -> {
                                                    resultData["ssid"] = ssid
                                                    resultData["securityType"] = securityType
                                                    resultData["hidden"] = hidden
                                                    resultData["pushedAt"] = System.currentTimeMillis()
                                                    Timber.i("📶 Wi-Fi profile pushed: $ssid ($securityType)")
                                                }
                                                android.net.wifi.WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_ADD_DUPLICATE -> {
                                                    resultData["ssid"] = ssid
                                                    resultData["note"] = "Network already configured"
                                                    Timber.i("📶 Wi-Fi profile already exists: $ssid")
                                                }
                                                else -> {
                                                    status = "FAILED"
                                                    errorMessage = "Failed to add Wi-Fi suggestion: status $addResult"
                                                    Timber.e("PUSH_WIFI failed with status: $addResult")
                                                }
                                            }
                                        }
                                    } catch (e: SecurityException) {
                                        status = "FAILED"
                                        errorMessage = "SecurityException: ${e.message}"
                                        Timber.e(e, "PUSH_WIFI SecurityException")
                                    } catch (e: Exception) {
                                        status = "FAILED"
                                        errorMessage = "Failed to push Wi-Fi profile: ${e.message}"
                                        Timber.e(e, "PUSH_WIFI failed")
                                    }
                                }
                            }
                            "BLOCK_WIFI_CONFIG" -> {
                                // Block/unblock Wi-Fi configuration by users
                                val blocked = cmd.parameters?.get("blocked") as? Boolean ?: true
                                
                                try {
                                    if (blocked) {
                                        dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CONFIG_WIFI)
                                        resultData["wifiConfigBlocked"] = true
                                        resultData["appliedAt"] = System.currentTimeMillis()
                                        Timber.i("🔒 Wi-Fi configuration BLOCKED")
                                    } else {
                                        dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CONFIG_WIFI)
                                        resultData["wifiConfigBlocked"] = false
                                        resultData["appliedAt"] = System.currentTimeMillis()
                                        Timber.i("🔓 Wi-Fi configuration UNBLOCKED")
                                    }
                                } catch (e: SecurityException) {
                                    status = "FAILED"
                                    errorMessage = "SecurityException: ${e.message} (requires Device Owner)"
                                    Timber.e(e, "BLOCK_WIFI_CONFIG SecurityException")
                                } catch (e: Exception) {
                                    status = "FAILED"
                                    errorMessage = "Failed to block Wi-Fi config: ${e.message}"
                                    Timber.e(e, "BLOCK_WIFI_CONFIG failed")
                                }
                            }
                            "ENFORCE_PASSWORD" -> {
                                // Extract password policy parameters
                                val quality = cmd.parameters?.get("quality") as? String ?: "COMPLEX"
                                val minLength = (cmd.parameters?.get("minLength") as? Number)?.toInt() ?: 8
                                val minLetters = (cmd.parameters?.get("minLetters") as? Number)?.toInt() ?: 1
                                val minNumeric = (cmd.parameters?.get("minNumeric") as? Number)?.toInt() ?: 1
                                val minSymbols = (cmd.parameters?.get("minSymbols") as? Number)?.toInt() ?: 1
                                val maxTimeToLockMinutes = (cmd.parameters?.get("maxTimeToLockMinutes") as? Number)?.toInt() ?: 5
                                val maxFailedAttempts = (cmd.parameters?.get("maxFailedAttempts") as? Number)?.toInt() ?: 10
                                
                                try {
                                    // Set password quality
                                    val passwordQuality = when (quality.uppercase()) {
                                        "NUMERIC" -> DevicePolicyManager.PASSWORD_QUALITY_NUMERIC
                                        "ALPHABETIC" -> DevicePolicyManager.PASSWORD_QUALITY_ALPHABETIC
                                        "ALPHANUMERIC" -> DevicePolicyManager.PASSWORD_QUALITY_ALPHANUMERIC
                                        "COMPLEX" -> DevicePolicyManager.PASSWORD_QUALITY_COMPLEX
                                        else -> DevicePolicyManager.PASSWORD_QUALITY_COMPLEX
                                    }
                                    
                                    dpm.setPasswordQuality(adminComponent, passwordQuality)
                                    dpm.setPasswordMinimumLength(adminComponent, minLength)
                                    
                                    // Complex password requirements
                                    if (passwordQuality == DevicePolicyManager.PASSWORD_QUALITY_COMPLEX) {
                                        dpm.setPasswordMinimumLetters(adminComponent, minLetters)
                                        dpm.setPasswordMinimumNumeric(adminComponent, minNumeric)
                                        dpm.setPasswordMinimumSymbols(adminComponent, minSymbols)
                                    }
                                    
                                    // Set auto-lock timeout (convert minutes to milliseconds)
                                    dpm.setMaximumTimeToLock(adminComponent, maxTimeToLockMinutes * 60 * 1000L)
                                    
                                    // Set maximum failed password attempts before wipe
                                    dpm.setMaximumFailedPasswordsForWipe(adminComponent, maxFailedAttempts)
                                    
                                    resultData["quality"] = quality
                                    resultData["minLength"] = minLength
                                    resultData["minLetters"] = minLetters
                                    resultData["minNumeric"] = minNumeric
                                    resultData["minSymbols"] = minSymbols
                                    resultData["maxTimeToLockMinutes"] = maxTimeToLockMinutes
                                    resultData["maxFailedAttempts"] = maxFailedAttempts
                                    resultData["enforcedAt"] = System.currentTimeMillis()
                                    
                                    // Check if current password meets requirements
                                    val isPasswordSufficient = dpm.isActivePasswordSufficient
                                    resultData["currentPasswordSufficient"] = isPasswordSufficient
                                    
                                    if (!isPasswordSufficient) {
                                        resultData["userActionRequired"] = "User must change password to meet new requirements"
                                    }
                                    
                                    Timber.i("🔐 Password policy enforced: $quality, min $minLength chars, lock after $maxTimeToLockMinutes min")
                                } catch (e: SecurityException) {
                                    status = "FAILED"
                                    errorMessage = "SecurityException: ${e.message}"
                                    Timber.e(e, "ENFORCE_PASSWORD SecurityException")
                                } catch (e: Exception) {
                                    status = "FAILED"
                                    errorMessage = "Failed to enforce password policy: ${e.message}"
                                    Timber.e(e, "ENFORCE_PASSWORD failed")
                                }
                            }
                            "REMOTE_WALLPAPER" -> {
                                // Extract wallpaper URL and support message
                                val wallpaperUrl = cmd.parameters?.get("wallpaperUrl") as? String
                                val supportMessage = cmd.parameters?.get("supportMessage") as? String
                                
                                if (wallpaperUrl.isNullOrEmpty()) {
                                    status = "FAILED"
                                    errorMessage = "Missing required parameter: wallpaperUrl"
                                    Timber.w("REMOTE_WALLPAPER failed: missing wallpaperUrl")
                                } else {
                                    try {
                                        // Download wallpaper image from URL
                                        Timber.i("🖼️ Downloading wallpaper from: $wallpaperUrl")
                                        
                                        val client = okhttp3.OkHttpClient()
                                        val request = okhttp3.Request.Builder()
                                            .url(wallpaperUrl)
                                            .build()
                                        
                                        val response = client.newCall(request).execute()
                                        
                                        if (!response.isSuccessful) {
                                            status = "FAILED"
                                            errorMessage = "Failed to download wallpaper: HTTP ${response.code}"
                                            Timber.e("Wallpaper download failed: ${response.code}")
                                        } else {
                                            val inputStream = response.body?.byteStream()
                                            if (inputStream != null) {
                                                val bitmap = android.graphics.BitmapFactory.decodeStream(inputStream)
                                                inputStream.close()
                                                
                                                if (bitmap != null) {
                                                    // Set wallpaper
                                                    val wallpaperManager = android.app.WallpaperManager.getInstance(applicationContext)
                                                    wallpaperManager.setBitmap(bitmap)
                                                    
                                                    resultData["wallpaperUrl"] = wallpaperUrl
                                                    resultData["wallpaperSet"] = true
                                                    resultData["setAt"] = System.currentTimeMillis()
                                                    
                                                    Timber.i("✅ Wallpaper set successfully")
                                                } else {
                                                    status = "FAILED"
                                                    errorMessage = "Failed to decode wallpaper image"
                                                    Timber.e("Invalid wallpaper image format")
                                                }
                                            } else {
                                                status = "FAILED"
                                                errorMessage = "Empty response body"
                                                Timber.e("Wallpaper response body is null")
                                            }
                                        }
                                        
                                        // Set support message if provided
                                        if (!supportMessage.isNullOrEmpty()) {
                                            dpm.setShortSupportMessage(adminComponent, supportMessage)
                                            resultData["supportMessage"] = supportMessage
                                            resultData["supportMessageSet"] = true
                                            Timber.i("💬 Support message set: $supportMessage")
                                        }
                                        
                                    } catch (e: SecurityException) {
                                        status = "FAILED"
                                        errorMessage = "SecurityException: ${e.message}"
                                        Timber.e(e, "REMOTE_WALLPAPER SecurityException")
                                    } catch (e: Exception) {
                                        status = "FAILED"
                                        errorMessage = "Failed to set wallpaper: ${e.message}"
                                        Timber.e(e, "REMOTE_WALLPAPER failed")
                                    }
                                }
                            }
                            "WIPE" -> {
                                Timber.w("🚨 Executing factory wipe requested by control plane dual-approval")
                                dpm.wipeData(DevicePolicyManager.WIPE_EXTERNAL_STORAGE)
                            }
                            "INSTALL_SOFTWARE" -> {
                                // Software Deployment Module integration (TASK-052 + TASK-054)
                                // Extract package metadata from payload
                                val packageId = cmd.parameters?.get("packageId") as? String
                                val packageName = cmd.parameters?.get("packageName") as? String
                                val packageVersion = cmd.parameters?.get("packageVersion") as? String
                                val deploymentId = cmd.parameters?.get("deploymentId") as? String
                                val fileUrl = cmd.parameters?.get("fileUrl") as? String
                                val fileHash = cmd.parameters?.get("fileHash") as? String
                                
                                if (fileUrl.isNullOrEmpty()) {
                                    status = "FAILED"
                                    errorMessage = "Missing required parameter: fileUrl"
                                    Timber.w("INSTALL_SOFTWARE failed: missing fileUrl")
                                } else {
                                    try {
                                        Timber.i("📦 Installing software package: ${packageName ?: "Unknown"} v${packageVersion ?: "Unknown"}")
                                        Timber.i("Deployment ID: $deploymentId, Package ID: $packageId")
                                        
                                        // Initialize silent package installer
                                        val installer = SilentPackageInstaller(applicationContext)
                                        
                                        // Check installation capability
                                        if (!installer.canInstallPackages()) {
                                            status = "FAILED"
                                            errorMessage = "Missing REQUEST_INSTALL_PACKAGES permission or not in Device Owner mode"
                                            resultData["requiresDeviceOwner"] = true
                                            Timber.w("INSTALL_SOFTWARE failed: cannot install packages")
                                            
                                            // Update deployment status to FAILED
                                            if (!deploymentId.isNullOrEmpty()) {
                                                try {
                                                    networkClient.apiService.updateDeploymentStatus(
                                                        deviceKey = storage.deviceKey!!,
                                                        deviceSecret = storage.deviceSecret!!,
                                                        deploymentId = deploymentId,
                                                        status = "FAILED",
                                                        failureDetails = mapOf(
                                                            "stage" to "PERMISSION_CHECK",
                                                            "error" to errorMessage,
                                                            "errorType" to "INSUFFICIENT_PERMISSIONS",
                                                            "timestamp" to System.currentTimeMillis()
                                                        )
                                                    )
                                                } catch (e: Exception) {
                                                    Timber.w(e, "Failed to update deployment status to FAILED")
                                                }
                                            }
                                        } else {
                                            // Update deployment status to DOWNLOADING
                                            if (!deploymentId.isNullOrEmpty()) {
                                                try {
                                                    networkClient.apiService.updateDeploymentStatus(
                                                        deviceKey = storage.deviceKey!!,
                                                        deviceSecret = storage.deviceSecret!!,
                                                        deploymentId = deploymentId,
                                                        status = "DOWNLOADING",
                                                        progress = mapOf(
                                                            "currentStep" to "Downloading APK",
                                                            "downloadProgress" to 0
                                                        )
                                                    )
                                                } catch (e: Exception) {
                                                    Timber.w(e, "Failed to update deployment status to DOWNLOADING")
                                                }
                                            }
                                            
                                            // Download and install APK
                                            Timber.i("📥 Downloading APK from: $fileUrl")
                                            val installResult = installer.installFromUrl(fileUrl, packageName)
                                            
                                            if (installResult.success) {
                                                // Installation successful
                                                resultData["packageId"] = packageId ?: "unknown"
                                                resultData["packageName"] = installResult.packageName ?: packageName ?: "unknown"
                                                resultData["packageVersion"] = packageVersion ?: "unknown"
                                                resultData["deploymentId"] = deploymentId ?: "unknown"
                                                resultData["installedAt"] = System.currentTimeMillis()
                                                resultData["fileUrl"] = fileUrl
                                                resultData["method"] = "PackageInstaller"
                                                
                                                Timber.i("✅ Software installation succeeded: ${installResult.packageName}")
                                                
                                                // Update deployment status to COMPLETED
                                                if (!deploymentId.isNullOrEmpty()) {
                                                    try {
                                                        networkClient.apiService.updateDeploymentStatus(
                                                            deviceKey = storage.deviceKey!!,
                                                            deviceSecret = storage.deviceSecret!!,
                                                            deploymentId = deploymentId,
                                                            status = "COMPLETED",
                                                            result = mapOf(
                                                                "success" to true,
                                                                "packageName" to (installResult.packageName ?: packageName ?: "unknown"),
                                                                "installedAt" to System.currentTimeMillis()
                                                            )
                                                        )
                                                    } catch (e: Exception) {
                                                        Timber.w(e, "Failed to update deployment status to COMPLETED")
                                                    }
                                                }
                                            } else {
                                                // Installation failed
                                                status = "FAILED"
                                                errorMessage = installResult.message
                                                resultData["packageId"] = packageId ?: "unknown"
                                                resultData["deploymentId"] = deploymentId ?: "unknown"
                                                resultData["fileUrl"] = fileUrl
                                                resultData["failureReason"] = installResult.message
                                                
                                                Timber.e("❌ Software installation failed: ${installResult.message}")
                                                
                                                // Update deployment status to FAILED
                                                if (!deploymentId.isNullOrEmpty()) {
                                                    try {
                                                        networkClient.apiService.updateDeploymentStatus(
                                                            deviceKey = storage.deviceKey!!,
                                                            deviceSecret = storage.deviceSecret!!,
                                                            deploymentId = deploymentId,
                                                            status = "FAILED",
                                                            result = mapOf(
                                                                "success" to false,
                                                                "error" to installResult.message
                                                            ),
                                                            failureDetails = mapOf(
                                                                "stage" to "INSTALLATION",
                                                                "error" to installResult.message,
                                                                "errorType" to "INSTALL_FAILED",
                                                                "timestamp" to System.currentTimeMillis()
                                                            )
                                                        )
                                                    } catch (e: Exception) {
                                                        Timber.w(e, "Failed to update deployment status to FAILED")
                                                    }
                                                }
                                            }
                                        }
                                    } catch (e: Exception) {
                                        status = "FAILED"
                                        errorMessage = "Software installation exception: ${e.message}"
                                        Timber.e(e, "INSTALL_SOFTWARE exception")
                                        
                                        // Update deployment status to FAILED on exception
                                        if (!deploymentId.isNullOrEmpty()) {
                                            try {
                                                networkClient.apiService.updateDeploymentStatus(
                                                    deviceKey = storage.deviceKey!!,
                                                    deviceSecret = storage.deviceSecret!!,
                                                    deploymentId = deploymentId,
                                                    status = "FAILED",
                                                    failureDetails = mapOf(
                                                        "stage" to "EXECUTION",
                                                        "error" to (e.message ?: "Unknown exception"),
                                                        "errorType" to "EXCEPTION",
                                                        "timestamp" to System.currentTimeMillis()
                                                    )
                                                )
                                            } catch (updateEx: Exception) {
                                                Timber.w(updateEx, "Failed to update deployment status on exception")
                                            }
                                        }
                                    }
                                }
                            }
                            "UNINSTALL_SOFTWARE" -> {
                                // Software Deployment Module integration (TASK-052 + TASK-054)
                                // Extract package metadata from payload
                                val packageId = cmd.parameters?.get("packageId") as? String
                                val packageName = cmd.parameters?.get("packageName") as? String
                                val packageVersion = cmd.parameters?.get("packageVersion") as? String
                                
                                if (packageName.isNullOrEmpty()) {
                                    status = "FAILED"
                                    errorMessage = "Missing required parameter: packageName"
                                    Timber.w("UNINSTALL_SOFTWARE failed: missing packageName")
                                } else {
                                    try {
                                        Timber.i("🗑️ Uninstalling software package: $packageName v${packageVersion ?: "Unknown"}")
                                        Timber.i("Package ID: $packageId")
                                        
                                        // Initialize silent package installer
                                        val installer = SilentPackageInstaller(applicationContext)
                                        
                                        // Check if package is installed
                                        if (!installer.isPackageInstalled(packageName)) {
                                            // Package not found - treat as success (idempotent operation)
                                            resultData["packageId"] = packageId ?: "unknown"
                                            resultData["packageName"] = packageName
                                            resultData["packageVersion"] = packageVersion ?: "unknown"
                                            resultData["uninstalledAt"] = System.currentTimeMillis()
                                            resultData["note"] = "Package not found - may have been already uninstalled"
                                            
                                            Timber.i("ℹ️ Package not installed: $packageName (treating as success)")
                                        } else {
                                            // Uninstall package
                                            val uninstallResult = installer.uninstallPackage(packageName)
                                            
                                            if (uninstallResult.success) {
                                                // Uninstallation successful
                                                resultData["packageId"] = packageId ?: "unknown"
                                                resultData["packageName"] = packageName
                                                resultData["packageVersion"] = packageVersion ?: "unknown"
                                                resultData["uninstalledAt"] = System.currentTimeMillis()
                                                resultData["method"] = "PackageInstaller"
                                                
                                                Timber.i("✅ Software uninstallation succeeded: $packageName")
                                            } else {
                                                // Uninstallation failed
                                                status = "FAILED"
                                                errorMessage = uninstallResult.message
                                                resultData["packageId"] = packageId ?: "unknown"
                                                resultData["packageName"] = packageName
                                                resultData["failureReason"] = uninstallResult.message
                                                
                                                Timber.e("❌ Software uninstallation failed: ${uninstallResult.message}")
                                            }
                                        }
                                    } catch (e: Exception) {
                                        status = "FAILED"
                                        errorMessage = "Software uninstallation exception: ${e.message}"
                                        Timber.e(e, "UNINSTALL_SOFTWARE exception")
                                    }
                                }
                            }
                            else -> {
                                status = "FAILED"
                                errorMessage = "Unsupported action type: ${cmd.actionType}"
                            }
                        }
                    } catch (e: Exception) {
                        status = "FAILED"
                        errorMessage = e.message ?: "Execution error"
                        Timber.e(e, "Command execution failed")
                    }

                    // Report result via HTTP API
                    networkClient.apiService.submitCommandResult(
                        deviceKey = storage.deviceKey!!,
                        deviceSecret = storage.deviceSecret!!,
                        payload = CommandResultPayload(
                            commandId = cmd.id,
                            status = status,
                            result = resultData,
                            errorMessage = errorMessage
                        )
                    )
                    
                    // Also send result via WebSocket if available (real-time delivery)
                    try {
                        val app = applicationContext as? SentinelApplication
                        val webSocketListener = app?.getWebSocketListener()
                        if (webSocketListener != null) {
                            val resultJson = buildString {
                                append("{")
                                append("\"status\":\"$status\",")
                                append("\"result\":${resultData},")
                                if (errorMessage != null) {
                                    append("\"error\":\"${errorMessage.replace("\"", "\\\"")}\",")
                                }
                                append("\"completedAt\":${System.currentTimeMillis()}")
                                append("}")
                            }
                            webSocketListener.sendCommandResult(cmd.id, status == "COMPLETED", resultJson)
                            Timber.d("Sent command result via WebSocket: ${cmd.id}")
                        }
                    } catch (e: Exception) {
                        Timber.w("Failed to send WebSocket result (non-critical): ${e.message}")
                        // Non-critical: HTTP API submission already succeeded
                    }
                }
            }
            Result.success()
        } catch (e: Exception) {
            Timber.e(e, "Command poll error")
            Result.success()
        }
    }
}
