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
                            "WIPE" -> {
                                Timber.w("🚨 Executing factory wipe requested by control plane dual-approval")
                                dpm.wipeData(DevicePolicyManager.WIPE_EXTERNAL_STORAGE)
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
