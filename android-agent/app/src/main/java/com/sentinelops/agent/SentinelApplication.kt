package com.sentinelops.agent

import android.app.Application
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.work.*
import com.sentinelops.agent.admin.SentinelDeviceAdminReceiver
import com.sentinelops.agent.telemetry.HeartbeatWorker
import com.sentinelops.agent.telemetry.OfflineSyncWorker
import com.sentinelops.agent.usage.UsageTelemetryWorker
import com.sentinelops.agent.commands.RemoteCommandWorker
import com.sentinelops.agent.data.storage.SecureStorage
import com.sentinelops.agent.network.SentinelWebSocketListener
import com.sentinelops.agent.security.AntiTamper
import com.sentinelops.agent.security.RootDetection
import timber.log.Timber
import java.util.concurrent.TimeUnit

class SentinelApplication : Application() {

    private lateinit var secureStorage: SecureStorage
    private var webSocketListener: SentinelWebSocketListener? = null

    override fun onCreate() {
        super.onCreate()

        // Initialize logging
        Timber.plant(Timber.DebugTree())
        Timber.i("🛡️ SentinelOps Enterprise Android DPC Initialized.")

        // Initialize secure storage
        secureStorage = SecureStorage(this)

        // Apply security hardening
        applySecurityHardening()

        // Schedule periodic background tasks
        setupBackgroundWorkers()

        // Initialize WebSocket connection for real-time commands
        setupWebSocketConnection()
    }

    override fun onTerminate() {
        super.onTerminate()
        // Clean up WebSocket resources
        webSocketListener?.cleanup()
    }

    /**
     * Apply comprehensive security hardening:
     * - Root detection
     * - Anti-tamper protections
     * - Battery optimization exclusion
     * - Safe mode detection
     */
    private fun applySecurityHardening() {
        Timber.i("Applying security hardening...")

        // 1. Root detection
        val rootResult = RootDetection.detectRoot()
        if (rootResult.isRooted) {
            Timber.w("⚠️ ROOT DETECTED: ${rootResult.indicators.size} indicators")
            Timber.w("Indicators: ${rootResult.indicators.joinToString(", ")}")
            
            // TODO: Report to backend in TASK-025 (telemetry)
            // For now, just log and continue (agent should still work on rooted devices)
        }

        // 2. Check safe mode
        if (AntiTamper.isInSafeMode(this)) {
            Timber.e("🚨 Device is in SAFE MODE - agent cannot function properly")
            // In safe mode, third-party apps are disabled
            // Agent will not receive commands or send telemetry
        }

        // 3. Check ADB debugging
        if (AntiTamper.isAdbEnabled(this)) {
            Timber.w("⚠️ ADB debugging is enabled")
            // TODO: Report to backend as security risk
        }

        // 4. Verify app integrity
        val integrityValid = AntiTamper.verifyAppIntegrity(this)
        if (!integrityValid) {
            Timber.e("🚨 App signature invalid - possible tampering detected")
            // TODO: Report to backend and potentially refuse to start
        }

        // 5. Apply anti-tamper protections (requires device admin)
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponent = ComponentName(this, SentinelDeviceAdminReceiver::class.java)

        if (dpm.isAdminActive(adminComponent)) {
            Timber.i("Device admin active, applying anti-tamper protections...")
            
            val result = AntiTamper.applyProtections(this, adminComponent, dpm)
            
            if (result.allSuccessful) {
                Timber.i("✓ All anti-tamper protections applied successfully")
            } else {
                Timber.w("⚠️ Some anti-tamper protections failed: ${result.successfulProtections}/${result.totalProtections}")
                Timber.w("Failed protections: ${result.details.filter { !it.value }.keys}")
            }
        } else {
            Timber.w("⚠️ Device admin not active - anti-tamper protections cannot be applied")
            Timber.w("App can be uninstalled by user")
        }

        // 6. Request battery optimization exclusion
        requestBatteryOptimizationExclusion()

        Timber.i("✓ Security hardening complete")
    }

    /**
     * Request exclusion from battery optimization to ensure background operations
     * continue reliably (telemetry, command polling, WebSocket connection).
     */
    private fun requestBatteryOptimizationExclusion() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            val packageName = packageName

            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                Timber.w("⚠️ Battery optimization is enabled - background tasks may be restricted")
                
                // In production deployment, this should be handled during provisioning
                // via Device Owner APIs or user consent during enrollment
                try {
                    val intent = Intent().apply {
                        action = Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
                        data = Uri.parse("package:$packageName")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    // Note: This will fail if app has no launcher activity
                    // In production, handle via Device Owner policy
                    // startActivity(intent)
                    
                    Timber.i("Battery optimization exclusion should be configured via device owner policy")
                } catch (e: Exception) {
                    Timber.e(e, "Cannot request battery optimization exclusion (no launcher activity)")
                }
            } else {
                Timber.i("✓ Battery optimization already disabled for this app")
            }
        }
    }

    /**
     * Initialize WebSocket connection for real-time command delivery.
     * Falls back to HTTP polling (WorkManager) if WebSocket fails.
     */
    private fun setupWebSocketConnection() {
        val baseUrl = System.getenv("BACKEND_BASE_URL") 
            ?: "https://api.sentinelops.com" // TODO: Replace with actual backend URL
        
        webSocketListener = SentinelWebSocketListener(
            context = this,
            secureStorage = secureStorage,
            baseUrl = baseUrl
        )
        
        // Connect if device is already enrolled
        if (!secureStorage.getDeviceKey().isNullOrEmpty()) {
            Timber.i("Device enrolled, connecting to WebSocket")
            webSocketListener?.connect()
        } else {
            Timber.i("Device not enrolled, WebSocket will connect after enrollment")
        }
    }

    /**
     * Get WebSocket listener instance for sending command results.
     * Used by RemoteCommandWorker to report execution results.
     */
    fun getWebSocketListener(): SentinelWebSocketListener? {
        return webSocketListener
    }

    private fun setupBackgroundWorkers() {
        val workManager = WorkManager.getInstance(this)

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        // Use EXPEDITED constraints for critical tasks (requires API 31+)
        val expeditedConstraints = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .build()
        } else {
            constraints
        }

        // 1. Periodic Heartbeat (Every 15 minutes) - EXPEDITED
        val heartbeatRequest = PeriodicWorkRequestBuilder<HeartbeatWorker>(15, TimeUnit.MINUTES)
            .setConstraints(expeditedConstraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                PeriodicWorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .build()

        workManager.enqueueUniquePeriodicWork(
            "sentinelops_heartbeat",
            ExistingPeriodicWorkPolicy.KEEP,
            heartbeatRequest
        )
        Timber.i("✓ Heartbeat worker scheduled (every 15 minutes)")

        // 2. Periodic App Usage Telemetry (Every 30 minutes)
        val usageRequest = PeriodicWorkRequestBuilder<UsageTelemetryWorker>(30, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                PeriodicWorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .build()

        workManager.enqueueUniquePeriodicWork(
            "sentinelops_usage",
            ExistingPeriodicWorkPolicy.KEEP,
            usageRequest
        )
        Timber.i("✓ Usage telemetry worker scheduled (every 30 minutes)")

        // 3. Periodic Remote Command Polling (Every 15 minutes background, instant via WebSocket)
        // This is fallback when WebSocket is disconnected
        val commandRequest = PeriodicWorkRequestBuilder<RemoteCommandWorker>(15, TimeUnit.MINUTES)
            .setConstraints(expeditedConstraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                PeriodicWorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .build()

        workManager.enqueueUniquePeriodicWork(
            "sentinelops_commands",
            ExistingPeriodicWorkPolicy.KEEP,
            commandRequest
        )
        Timber.i("✓ Command polling worker scheduled (every 15 minutes)")

        // 4. Periodic Offline Queue Sync (Every 15 minutes) - NEW
        val offlineSyncRequest = PeriodicWorkRequestBuilder<OfflineSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(expeditedConstraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                PeriodicWorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .build()

        workManager.enqueueUniquePeriodicWork(
            "sentinelops_offline_sync",
            ExistingPeriodicWorkPolicy.KEEP,
            offlineSyncRequest
        )
        Timber.i("✓ Offline sync worker scheduled (every 15 minutes)")
    }
}
