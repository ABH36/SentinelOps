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
}
