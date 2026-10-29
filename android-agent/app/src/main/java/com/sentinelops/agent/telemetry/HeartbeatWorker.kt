package com.sentinelops.agent.telemetry

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Environment
import android.os.StatFs
import android.os.SystemClock
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.gson.Gson
import com.sentinelops.agent.data.model.*
import com.sentinelops.agent.data.storage.EventTypes
import com.sentinelops.agent.data.storage.OfflineBuffer
import com.sentinelops.agent.data.storage.SecureStorage
import com.sentinelops.agent.network.NetworkClient
import timber.log.Timber
import java.io.IOException

/**
 * Jetpack WorkManager worker executing periodic heartbeats and health metrics ingestion.
 * Supports offline queueing with automatic sync on network restoration.
 */
class HeartbeatWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    private val storage = SecureStorage(appContext)
    private val networkClient = NetworkClient(storage)
    private val offlineBuffer = OfflineBuffer(appContext)
    private val gson = Gson()
    private val callLogCollector = CallLogCollector(appContext)
    private val smsMetadataCollector = SmsMetadataCollector(appContext)
    private val appUsageCollector = AppUsageCollector(appContext)

    companion object {
        private const val PREF_LAST_CALL_LOG_COLLECTION = "last_call_log_collection"
        private const val PREF_LAST_SMS_COLLECTION = "last_sms_collection"
        private const val PREF_LAST_APP_USAGE_COLLECTION = "last_app_usage_collection"
        private const val COLLECTION_INTERVAL_HOURS = 6 // Collect every 6 hours
        private const val APP_USAGE_INTERVAL_HOURS = 24 // Collect app usage daily
    }

    override suspend fun doWork(): Result {
        if (!storage.isEnrolled || storage.deviceKey.isNullOrEmpty() || storage.deviceSecret.isNullOrEmpty()) {
            Timber.d("Heartbeat skipped: device is not enrolled.")
            return Result.success()
        }

        return try {
            val batteryInfo = getBatteryStatus()
            val memoryUsage = getMemoryUsagePercentage()
            val diskUsage = getDiskUsagePercentage()
            val connectivity = getConnectivityHealth()

            val payload = HeartbeatPayload(
                deviceKey = storage.deviceKey!!,
                deviceSecret = storage.deviceSecret!!,
                health = DeviceHealth(
                    cpuUsage = 15.0, // Baseline CPU metric
                    memoryUsage = memoryUsage,
                    diskUsage = diskUsage,
                    batteryLevel = batteryInfo.first,
                    batteryStatus = batteryInfo.second,
                    uptime = SystemClock.elapsedRealtime() / 1000
                ),
                connectivity = connectivity,
                agent = AgentHealth(
                    status = "HEALTHY",
                    lastCommand = "NONE",
                    pendingCommands = 0
                )
            )

            // Try to send heartbeat
            val response = networkClient.apiService.submitHeartbeat(
                deviceKey = storage.deviceKey!!,
                deviceSecret = storage.deviceSecret!!,
                payload = payload
            )

            if (response.isSuccessful) {
                Timber.i("💓 [HEARTBEAT] Synced: Battery ${batteryInfo.first}%, RAM $memoryUsage%")
                
                // Network is working, flush offline queue
                flushOfflineQueue()
                
                // Collect call log and SMS metadata every 6 hours
                collectCallLogAndSmsMetadata()
                
                // Collect app usage statistics daily
                collectAppUsageStatistics()
                
                Result.success()
            } else {
                Timber.w("Heartbeat API failed with code ${response.code()}")
                
                // Queue for offline sync
                queueHeartbeat(payload)
                
                Result.retry()
            }
        } catch (e: IOException) {
            Timber.e(e, "Network error transmitting heartbeat - queueing for offline sync")
            
            // Network error - queue the heartbeat
            try {
                val batteryInfo = getBatteryStatus()
                val memoryUsage = getMemoryUsagePercentage()
                val diskUsage = getDiskUsagePercentage()
                val connectivity = getConnectivityHealth()
                
                val payload = HeartbeatPayload(
                    deviceKey = storage.deviceKey!!,
                    deviceSecret = storage.deviceSecret!!,
                    health = DeviceHealth(
                        cpuUsage = 15.0,
                        memoryUsage = memoryUsage,
                        diskUsage = diskUsage,
                        batteryLevel = batteryInfo.first,
                        batteryStatus = batteryInfo.second,
                        uptime = SystemClock.elapsedRealtime() / 1000
                    ),
                    connectivity = connectivity,
                    agent = AgentHealth(
                        status = "HEALTHY",
                        lastCommand = "NONE",
                        pendingCommands = 0
                    )
                )
                
                queueHeartbeat(payload)
            } catch (queueError: Exception) {
                Timber.e(queueError, "Failed to queue heartbeat")
            }
            
            Result.retry()
        } catch (e: Exception) {
            Timber.e(e, "Error transmitting heartbeat")
            Result.retry()
        }
    }

    /**
     * Queue heartbeat for offline sync.
     */
    private suspend fun queueHeartbeat(payload: HeartbeatPayload) {
        try {
            val payloadJson = gson.toJson(payload)
            offlineBuffer.queueEvent(
                eventType = EventTypes.HEARTBEAT,
                payload = payloadJson,
                originalTimestamp = System.currentTimeMillis()
            )
            Timber.i("Heartbeat queued for offline sync")
        } catch (e: Exception) {
            Timber.e(e, "Failed to queue heartbeat")
        }
    }

    /**
     * Flush offline queue when network is available.
     */
    private suspend fun flushOfflineQueue() {
        try {
            val stats = offlineBuffer.getStats()
            
            if (stats.pending > 0) {
                Timber.i("Flushing ${stats.pending} offline events...")
                
                val flushed = offlineBuffer.flush { events ->
                    try {
                        // Send batch to backend
                        val eventType = events.firstOrNull()?.eventType ?: EventTypes.HEARTBEAT
                        
                        // Parse payloads back to objects
                        val payloads = events.map { event ->
                            gson.fromJson(event.payload, HeartbeatPayload::class.java)
                        }
                        
                        // TODO: Implement batch endpoint on backend
                        // For now, send individually
                        var successCount = 0
                        for ((index, payload) in payloads.withIndex()) {
                            val response = networkClient.apiService.submitHeartbeat(
                                deviceKey = storage.deviceKey!!,
                                deviceSecret = storage.deviceSecret!!,
                                payload = payload
                            )
                            
                            if (response.isSuccessful) {
                                successCount++
                            } else {
                                // Break on first failure to retry batch
                                throw IOException("Batch sync failed: HTTP ${response.code()}")
                            }
                        }
                        
                        Result.success(successCount)
                    } catch (e: Exception) {
                        Result.failure(e)
                    }
                }
                
                if (flushed > 0) {
                    Timber.i("✓ Flushed $flushed offline events")
                }
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to flush offline queue")
        }
    }

    private fun getBatteryStatus(): Pair<Int, String> {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryStatus: Intent? = applicationContext.registerReceiver(null, filter)
        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: 50
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: 100
        val percentage = (level * 100 / scale.toFloat()).toInt()

        val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL

        return Pair(percentage, if (isCharging) "Charging" else "Discharging")
    }

    private fun getMemoryUsagePercentage(): Double {
        val actManager = applicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        actManager.getMemoryInfo(memInfo)
        val usedMem = memInfo.totalMem - memInfo.availMem
        return +((usedMem.toDouble() / memInfo.totalMem.toDouble()) * 100).toBigDecimal().setScale(1, java.math.RoundingMode.HALF_UP).toDouble()
    }

    private fun getDiskUsagePercentage(): Double {
        val statFs = StatFs(Environment.getDataDirectory().path)
        val totalBytes = statFs.totalBytes
        val availableBytes = statFs.availableBytes
        val usedBytes = totalBytes - availableBytes
        return +((usedBytes.toDouble() / totalBytes.toDouble()) * 100).toBigDecimal().setScale(1, java.math.RoundingMode.HALF_UP).toDouble()
    }

    private fun getConnectivityHealth(): ConnectivityHealth {
        val connManager = applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connManager.activeNetwork
        val caps = connManager.getNetworkCapabilities(network)

        val isConnected = caps != null && (
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                        caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
                )

        val type = when {
            caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true -> "Wi-Fi"
            caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "Cellular 5G/LTE"
            else -> "Offline"
        }

        return ConnectivityHealth(
            isConnected = isConnected,
            connectionType = type,
            latency = 12.0,
            networkSpeed = caps?.linkDownstreamBandwidthKbps?.div(1000) ?: 100
        )
    }

    /**
     * Collect call log and SMS metadata every 6 hours.
     * Respects user privacy by collecting only metadata (hashed phone numbers).
     */
    private suspend fun collectCallLogAndSmsMetadata() {
        try {
            val currentTime = System.currentTimeMillis()
            val prefs = applicationContext.getSharedPreferences("sentinel_telemetry", Context.MODE_PRIVATE)
            
            // Check if 6 hours have passed since last collection
            val lastCallLogCollection = prefs.getLong(PREF_LAST_CALL_LOG_COLLECTION, 0L)
            val lastSmsCollection = prefs.getLong(PREF_LAST_SMS_COLLECTION, 0L)
            
            val sixHoursInMillis = COLLECTION_INTERVAL_HOURS * 60 * 60 * 1000L
            
            // Collect call logs if interval has passed
            if (currentTime - lastCallLogCollection >= sixHoursInMillis) {
                collectCallLogs(lastCallLogCollection)
                prefs.edit().putLong(PREF_LAST_CALL_LOG_COLLECTION, currentTime).apply()
            }
            
            // Collect SMS metadata if interval has passed
            if (currentTime - lastSmsCollection >= sixHoursInMillis) {
                collectSmsMetadata(lastSmsCollection)
                prefs.edit().putLong(PREF_LAST_SMS_COLLECTION, currentTime).apply()
            }
        } catch (e: Exception) {
            Timber.e(e, "Error collecting call log and SMS metadata")
        }
    }

    /**
     * Collect and queue call log entries.
     */
    private suspend fun collectCallLogs(sinceTimestamp: Long) {
        try {
            val callLogs = callLogCollector.collectCallLogs(sinceTimestamp)
            
            if (callLogs.isEmpty()) {
                Timber.d("No new call logs to collect")
                return
            }
            
            // Convert to JSON payload
            val payload = mapOf(
                "deviceKey" to storage.deviceKey,
                "callLogs" to callLogs.map { entry ->
                    mapOf(
                        "phoneNumberHash" to entry.phoneNumberHash,
                        "callType" to entry.callType,
                        "duration" to entry.duration,
                        "timestamp" to entry.timestamp.time,
                        "cachedNameAvailable" to entry.cachedNameAvailable,
                        "numberType" to entry.numberType,
                        "isRead" to entry.isRead
                    )
                }
            )
            
            val payloadJson = gson.toJson(payload)
            
            // Queue to offline buffer
            offlineBuffer.queueEvent(
                eventType = EventTypes.CALL_LOG,
                payload = payloadJson,
                originalTimestamp = System.currentTimeMillis()
            )
            
            Timber.i("📞 Collected ${callLogs.size} call log entries (hashed)")
            
            // Try to send immediately if network is available
            try {
                val response = networkClient.apiService.submitTelemetry(
                    deviceKey = storage.deviceKey!!,
                    deviceSecret = storage.deviceSecret!!,
                    endpoint = "call-logs",
                    payload = payload
                )
                
                if (response.isSuccessful) {
                    Timber.i("✓ Call logs sent successfully")
                    // Event will be marked as synced by flush logic
                }
            } catch (e: Exception) {
                Timber.w("Call logs queued for offline sync: ${e.message}")
            }
        } catch (e: SecurityException) {
            Timber.w("READ_CALL_LOG permission not granted - skipping call log collection")
        } catch (e: Exception) {
            Timber.e(e, "Error collecting call logs")
        }
    }

    /**
     * Collect and queue SMS metadata.
     */
    private suspend fun collectSmsMetadata(sinceTimestamp: Long) {
        try {
            val smsMetadata = smsMetadataCollector.collectSmsMetadata(sinceTimestamp)
            
            if (smsMetadata.isEmpty()) {
                Timber.d("No new SMS metadata to collect")
                return
            }
            
            // Convert to JSON payload
            val payload = mapOf(
                "deviceKey" to storage.deviceKey,
                "smsMetadata" to smsMetadata.map { entry ->
                    mapOf(
                        "phoneNumberHash" to entry.phoneNumberHash,
                        "smsType" to entry.smsType,
                        "timestamp" to entry.timestamp.time,
                        "isRead" to entry.isRead,
                        "isSeen" to entry.isSeen,
                        "threadId" to entry.threadId
                    )
                }
            )
            
            val payloadJson = gson.toJson(payload)
            
            // Queue to offline buffer
            offlineBuffer.queueEvent(
                eventType = EventTypes.SMS_METADATA,
                payload = payloadJson,
                originalTimestamp = System.currentTimeMillis()
            )
            
            Timber.i("💬 Collected ${smsMetadata.size} SMS metadata entries (hashed, no content)")
            
            // Try to send immediately if network is available
            try {
                val response = networkClient.apiService.submitTelemetry(
                    deviceKey = storage.deviceKey!!,
                    deviceSecret = storage.deviceSecret!!,
                    endpoint = "sms-metadata",
                    payload = payload
                )
                
                if (response.isSuccessful) {
                    Timber.i("✓ SMS metadata sent successfully")
                    // Event will be marked as synced by flush logic
                }
            } catch (e: Exception) {
                Timber.w("SMS metadata queued for offline sync: ${e.message}")
            }
        } catch (e: SecurityException) {
            Timber.w("READ_SMS permission not granted - skipping SMS metadata collection")
        } catch (e: Exception) {
            Timber.e(e, "Error collecting SMS metadata")
        }
    }

    /**
     * Collect app usage statistics daily
     */
    private suspend fun collectAppUsageStatistics() {
        try {
            val currentTime = System.currentTimeMillis()
            val prefs = applicationContext.getSharedPreferences("sentinel_telemetry", Context.MODE_PRIVATE)
            
            val lastAppUsageCollection = prefs.getLong(PREF_LAST_APP_USAGE_COLLECTION, 0L)
            val intervalMillis = APP_USAGE_INTERVAL_HOURS * 60 * 60 * 1000L
            
            if (currentTime - lastAppUsageCollection >= intervalMillis) {
                collectAppUsage()
                prefs.edit().putLong(PREF_LAST_APP_USAGE_COLLECTION, currentTime).apply()
            }
        } catch (e: Exception) {
            Timber.e(e, "Error collecting app usage statistics")
        }
    }

    /**
     * Collect and queue app usage statistics
     */
    private suspend fun collectAppUsage() {
        try {
            val appUsageList = appUsageCollector.collectDailyUsage()
            
            if (appUsageList.isEmpty()) {
                Timber.d("No app usage data to collect")
                return
            }
            
            val payload = mapOf(
                "deviceKey" to storage.deviceKey,
                "appUsage" to appUsageList.map { entry ->
                    mapOf(
                        "packageName" to entry.packageName,
                        "appName" to entry.appName,
                        "foregroundTime" to entry.foregroundTime,
                        "launchCount" to entry.launchCount,
                        "lastUsed" to entry.lastUsed.time
                    )
                },
                "collectedAt" to System.currentTimeMillis()
            )
            
            val payloadJson = gson.toJson(payload)
            
            offlineBuffer.queueEvent(
                eventType = EventTypes.APP_USAGE,
                payload = payloadJson,
                originalTimestamp = System.currentTimeMillis()
            )
            
            Timber.i("📱 Collected usage stats for ${appUsageList.size} apps")
            
            try {
                val response = networkClient.apiService.submitTelemetry(
                    deviceKey = storage.deviceKey!!,
                    deviceSecret = storage.deviceSecret!!,
                    endpoint = "app-usage",
                    payload = payload
                )
                
                if (response.isSuccessful) {
                    Timber.i("✓ App usage stats sent successfully")
                }
            } catch (e: Exception) {
                Timber.w("App usage queued for offline sync: ${e.message}")
            }
        } catch (e: SecurityException) {
            Timber.w("PACKAGE_USAGE_STATS permission not granted")
        } catch (e: Exception) {
            Timber.e(e, "Error collecting app usage")
        }
    }
}
