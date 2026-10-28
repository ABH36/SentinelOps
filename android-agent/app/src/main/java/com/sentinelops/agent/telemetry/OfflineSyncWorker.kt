package com.sentinelops.agent.telemetry

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.gson.Gson
import com.sentinelops.agent.data.model.HeartbeatPayload
import com.sentinelops.agent.data.storage.EventTypes
import com.sentinelops.agent.data.storage.OfflineBuffer
import com.sentinelops.agent.data.storage.SecureStorage
import com.sentinelops.agent.network.NetworkClient
import timber.log.Timber
import java.io.IOException

/**
 * Dedicated worker for syncing offline queue.
 * Runs every 15 minutes to ensure pending events are synced even if heartbeat fails.
 */
class OfflineSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    private val storage = SecureStorage(appContext)
    private val networkClient = NetworkClient(storage)
    private val offlineBuffer = OfflineBuffer(appContext)
    private val gson = Gson()

    override suspend fun doWork(): Result {
        if (!storage.isEnrolled || storage.deviceKey.isNullOrEmpty() || storage.deviceSecret.isNullOrEmpty()) {
            Timber.d("Offline sync skipped: device is not enrolled.")
            return Result.success()
        }

        return try {
            val stats = offlineBuffer.getStats()
            
            if (stats.pending == 0) {
                Timber.d("Offline queue empty, no sync needed")
                return Result.success()
            }
            
            Timber.i("Offline sync: ${stats.pending} pending events")
            
            val flushed = offlineBuffer.flush { events ->
                try {
                    val eventType = events.firstOrNull()?.eventType ?: EventTypes.HEARTBEAT
                    
                    // Parse payloads based on event type
                    val payloads = when (eventType) {
                        EventTypes.HEARTBEAT -> {
                            events.map { event ->
                                gson.fromJson(event.payload, HeartbeatPayload::class.java)
                            }
                        }
                        EventTypes.USAGE, EventTypes.ACTIVITY -> {
                            // Parse as usage telemetry
                            events.map { event ->
                                // Payload is already JSON string, can send directly
                                event.payload
                            }
                        }
                        else -> {
                            // Generic JSON payloads
                            events.map { event -> event.payload }
                        }
                    }
                    
                    // Send batch to backend
                    // TODO: Implement batch endpoint on backend
                    // For now, send individually
                    var successCount = 0
                    
                    when (eventType) {
                        EventTypes.HEARTBEAT -> {
                            for (payload in payloads) {
                                if (payload is HeartbeatPayload) {
                                    val response = networkClient.apiService.submitHeartbeat(
                                        deviceKey = storage.deviceKey!!,
                                        deviceSecret = storage.deviceSecret!!,
                                        payload = payload
                                    )
                                    
                                    if (response.isSuccessful) {
                                        successCount++
                                    } else {
                                        throw IOException("Sync failed: HTTP ${response.code()}")
                                    }
                                }
                            }
                        }
                        else -> {
                            // Other event types can be added here
                            Timber.w("Event type $eventType not yet implemented for batch sync")
                        }
                    }
                    
                    Result.success(successCount)
                } catch (e: Exception) {
                    Timber.e(e, "Failed to sync batch")
                    Result.failure(e)
                }
            }
            
            if (flushed > 0) {
                Timber.i("✓ Offline sync completed: $flushed events synced")
                Result.success()
            } else {
                Timber.w("Offline sync: no events were synced")
                Result.retry()
            }
        } catch (e: Exception) {
            Timber.e(e, "Offline sync error")
            Result.retry()
        }
    }
}
