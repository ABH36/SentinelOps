package com.sentinelops.agent.telemetry

import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import java.util.Date

/**
 * App Usage Statistics Collector
 * 
 * Collects per-app usage statistics using Android's UsageStatsManager.
 * Tracks foreground time, launch counts, and last used timestamps.
 * 
 * REQUIRES: PACKAGE_USAGE_STATS permission (user must grant in Settings)
 */
class AppUsageCollector(private val context: Context) {

    companion object {
        private const val TAG = "AppUsageCollector"
    }

    /**
     * Collect app usage statistics for the specified time range
     * 
     * @param startTime Start of collection period (Unix timestamp in ms)
     * @param endTime End of collection period (Unix timestamp in ms)
     * @return List of app usage entries
     */
    fun collectAppUsage(startTime: Long, endTime: Long): List<AppUsageEntry> {
        val appUsageList = mutableListOf<AppUsageEntry>()

        try {
            // Check if permission is granted
            if (!hasUsageStatsPermission()) {
                Log.w(TAG, "PACKAGE_USAGE_STATS permission not granted")
                return emptyList()
            }

            val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
            if (usageStatsManager == null) {
                Log.e(TAG, "UsageStatsManager not available")
                return emptyList()
            }

            // Query usage stats for the time range
            val usageStatsList = usageStatsManager.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY,
                startTime,
                endTime
            )

            if (usageStatsList.isEmpty()) {
                Log.d(TAG, "No usage stats available for period ${Date(startTime)} to ${Date(endTime)}")
                return emptyList()
            }

            // Get package manager for app names
            val packageManager = context.packageManager

            // Process each app's usage stats
            for (usageStats in usageStatsList) {
                try {
                    // Skip apps with zero usage
                    if (usageStats.totalTimeInForeground == 0L) {
                        continue
                    }

                    val packageName = usageStats.packageName
                    
                    // Get app name from package manager
                    val appName = try {
                        val appInfo = packageManager.getApplicationInfo(packageName, 0)
                        packageManager.getApplicationLabel(appInfo).toString()
                    } catch (e: PackageManager.NameNotFoundException) {
                        packageName // Use package name if app name not found
                    }

                    val entry = AppUsageEntry(
                        packageName = packageName,
                        appName = appName,
                        foregroundTime = usageStats.totalTimeInForeground, // in milliseconds
                        launchCount = usageStats.launchCount ?: 0,
                        lastUsed = Date(usageStats.lastTimeUsed),
                        firstUsed = Date(usageStats.firstTimeStamp),
                        lastTimeVisible = if (usageStats.lastTimeVisible > 0) Date(usageStats.lastTimeVisible) else null
                    )

                    appUsageList.add(entry)
                } catch (e: Exception) {
                    Log.e(TAG, "Error processing usage stats for ${usageStats.packageName}", e)
                }
            }

            // Sort by foreground time descending
            appUsageList.sortByDescending { it.foregroundTime }

            Log.i(TAG, "Collected usage stats for ${appUsageList.size} apps")
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException accessing usage stats - permission denied", e)
        } catch (e: Exception) {
            Log.e(TAG, "Error collecting app usage statistics", e)
        }

        return appUsageList
    }

    /**
     * Collect app usage for the last 24 hours
     */
    fun collectDailyUsage(): List<AppUsageEntry> {
        val endTime = System.currentTimeMillis()
        val startTime = endTime - (24 * 60 * 60 * 1000L) // 24 hours ago
        return collectAppUsage(startTime, endTime)
    }

    /**
     * Collect app usage for the last 7 days
     */
    fun collectWeeklyUsage(): List<AppUsageEntry> {
        val endTime = System.currentTimeMillis()
        val startTime = endTime - (7 * 24 * 60 * 60 * 1000L) // 7 days ago
        return collectAppUsage(startTime, endTime)
    }

    /**
     * Get usage statistics summary
     */
    fun getUsageStatistics(startTime: Long, endTime: Long): UsageStatistics {
        val appUsageList = collectAppUsage(startTime, endTime)

        val totalForegroundTime = appUsageList.sumOf { it.foregroundTime }
        val totalLaunches = appUsageList.sumOf { it.launchCount }
        val uniqueAppsUsed = appUsageList.size

        // Calculate top apps
        val topAppsByTime = appUsageList.take(10)
        val topAppsByLaunches = appUsageList.sortedByDescending { it.launchCount }.take(10)

        return UsageStatistics(
            periodStart = Date(startTime),
            periodEnd = Date(endTime),
            totalForegroundTime = totalForegroundTime,
            totalLaunches = totalLaunches,
            uniqueAppsUsed = uniqueAppsUsed,
            topAppsByTime = topAppsByTime.take(5),
            topAppsByLaunches = topAppsByLaunches.take(5),
            averageSessionDuration = if (totalLaunches > 0) totalForegroundTime / totalLaunches else 0
        )
    }

    /**
     * Check if PACKAGE_USAGE_STATS permission is granted
     * 
     * Note: This is a special permission that must be granted in Settings > Special app access
     */
    private fun hasUsageStatsPermission(): Boolean {
        return try {
            val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
            if (usageStatsManager == null) {
                return false
            }

            // Try to query usage stats - if permission is denied, result will be empty
            val endTime = System.currentTimeMillis()
            val startTime = endTime - (1000 * 60) // 1 minute ago
            val usageStatsList = usageStatsManager.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY,
                startTime,
                endTime
            )

            // If we get a non-null result, permission is granted
            // Empty list is valid if no apps were used in the time range
            usageStatsList != null
        } catch (e: Exception) {
            Log.e(TAG, "Error checking usage stats permission", e)
            false
        }
    }
}

/**
 * App usage entry with statistics
 */
data class AppUsageEntry(
    val packageName: String,              // e.g., "com.android.chrome"
    val appName: String,                  // e.g., "Chrome"
    val foregroundTime: Long,             // Total time in foreground (milliseconds)
    val launchCount: Int,                 // Number of times app was launched
    val lastUsed: Date,                   // Last time app was used
    val firstUsed: Date,                  // First time app was used in period
    val lastTimeVisible: Date?            // Last time app was visible (may be null)
) {
    /**
     * Get foreground time in seconds
     */
    fun getForegroundTimeSeconds(): Long = foregroundTime / 1000

    /**
     * Get foreground time in minutes
     */
    fun getForegroundTimeMinutes(): Long = foregroundTime / (1000 * 60)

    /**
     * Get foreground time in hours
     */
    fun getForegroundTimeHours(): Double = foregroundTime / (1000.0 * 60 * 60)
}

/**
 * Usage statistics summary
 */
data class UsageStatistics(
    val periodStart: Date,
    val periodEnd: Date,
    val totalForegroundTime: Long,        // Total across all apps (milliseconds)
    val totalLaunches: Int,               // Total across all apps
    val uniqueAppsUsed: Int,              // Number of different apps used
    val topAppsByTime: List<AppUsageEntry>,
    val topAppsByLaunches: List<AppUsageEntry>,
    val averageSessionDuration: Long      // Average time per launch (milliseconds)
)
