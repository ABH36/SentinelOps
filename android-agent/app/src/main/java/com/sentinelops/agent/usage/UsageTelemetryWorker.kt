package com.sentinelops.agent.usage

import android.app.usage.UsageStatsManager
import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.sentinelops.agent.data.model.UsageEventItem
import com.sentinelops.agent.data.model.UsageSubmitPayload
import com.sentinelops.agent.data.storage.SecureStorage
import com.sentinelops.agent.network.NetworkClient
import timber.log.Timber
import java.text.SimpleDateFormat
import java.util.*

/**
 * Collects foreground corporate app usage statistics via Android UsageStatsManager
 * without capturing keystrokes, personal messages, or screen contents.
 */
class UsageTelemetryWorker(
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
            val usm = applicationContext.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
                ?: return Result.success()

            val calendar = Calendar.getInstance()
            val endTime = calendar.timeInMillis
            calendar.add(Calendar.MINUTE, -15) // Past 15 minutes
            val startTime = calendar.timeInMillis

            val usageStats = usm.queryUsageStats(UsageStatsManager.INTERVAL_BEST, startTime, endTime)
            val events = mutableListOf<UsageEventItem>()
            val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }

            // Group by package and aggregate total foreground time
            usageStats
                .filter { it.totalTimeInForeground > 5000 } // At least 5s active
                .sortedByDescending { it.totalTimeInForeground }
                .take(5) // Top 5 foreground apps in window
                .forEach { stat ->
                    events.add(
                        UsageEventItem(
                            activeWindowProcess = stat.packageName,
                            activeWindowTitle = stat.packageName.substringAfterLast('.'),
                            activeDurationSeconds = stat.totalTimeInForeground / 1000,
                            idleDurationSeconds = 0,
                            activityState = "ACTIVE",
                            timestamp = isoFormat.format(Date(stat.lastTimeUsed))
                        )
                    )
                }

            if (events.isNotEmpty()) {
                val payload = UsageSubmitPayload(events = events)
                val response = networkClient.apiService.submitUsage(
                    deviceKey = storage.deviceKey!!,
                    deviceSecret = storage.deviceSecret!!,
                    payload = payload
                )

                if (response.isSuccessful) {
                    Timber.i("📊 [USAGE] Submitted ${events.size} app activity samples.")
                }
            }

            Result.success()
        } catch (e: Exception) {
            Timber.e(e, "Error collecting/submitting app usage stats")
            Result.success()
        }
    }
}
