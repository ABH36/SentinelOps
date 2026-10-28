package com.sentinelops.agent.data.storage

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import net.sqlcipher.database.SQLiteDatabase
import net.sqlcipher.database.SupportFactory
import timber.log.Timber
import java.security.SecureRandom

/**
 * Offline event database using Room with SQLCipher encryption.
 * 
 * Features:
 * - SQLCipher AES-256 encryption
 * - Automatic queue management (max 100,000 events)
 * - Batch sync support
 * - Exponential backoff for failed syncs
 * - Original timestamps preserved
 */
@Database(
    entities = [QueuedEvent::class],
    version = 1,
    exportSchema = false
)
abstract class OfflineDatabase : RoomDatabase() {
    
    abstract fun queuedEventDao(): QueuedEventDao

    companion object {
        private const val DATABASE_NAME = "sentinel_offline.db"
        private const val MAX_QUEUE_SIZE = 100_000
        private const val BATCH_SIZE = 500
        private const val MAX_RETRY_COUNT = 5

        @Volatile
        private var INSTANCE: OfflineDatabase? = null

        /**
         * Get database instance with SQLCipher encryption.
         */
        fun getInstance(context: Context): OfflineDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = buildDatabase(context)
                INSTANCE = instance
                instance
            }
        }

        /**
         * Build database with SQLCipher encryption.
         */
        private fun buildDatabase(context: Context): OfflineDatabase {
            // Generate encryption passphrase from device-specific data
            val passphrase = generatePassphrase(context)
            
            // Create SQLCipher support factory
            val factory = SupportFactory(SQLiteDatabase.getBytes(passphrase.toCharArray()))

            return Room.databaseBuilder(
                context.applicationContext,
                OfflineDatabase::class.java,
                DATABASE_NAME
            )
                .openHelperFactory(factory)
                .addCallback(object : RoomDatabase.Callback() {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        super.onCreate(db)
                        Timber.i("Offline database created with encryption")
                    }

                    override fun onOpen(db: SupportSQLiteDatabase) {
                        super.onOpen(db)
                        Timber.d("Offline database opened")
                    }
                })
                .build()
        }

        /**
         * Generate encryption passphrase from device-specific data.
         * Uses Android ID + package name for device-unique encryption.
         */
        private fun generatePassphrase(context: Context): String {
            val androidId = android.provider.Settings.Secure.getString(
                context.contentResolver,
                android.provider.Settings.Secure.ANDROID_ID
            )
            
            val packageName = context.packageName
            
            // Combine Android ID + package name for device-unique passphrase
            // In production, consider using Android Keystore for even stronger protection
            return "${androidId}_${packageName}_sentinel_offline_v1"
        }

        /**
         * Close database instance (for testing).
         */
        fun closeDatabase() {
            INSTANCE?.close()
            INSTANCE = null
        }
    }
}

/**
 * Offline buffer manager for easy access to queue operations.
 */
class OfflineBuffer(private val context: Context) {
    
    private val database: OfflineDatabase by lazy {
        OfflineDatabase.getInstance(context)
    }
    
    private val dao: QueuedEventDao by lazy {
        database.queuedEventDao()
    }

    /**
     * Queue an event for offline storage when network is unavailable.
     */
    suspend fun queueEvent(
        eventType: String,
        payload: String,
        originalTimestamp: Long = System.currentTimeMillis()
    ): Long {
        try {
            // Enforce queue size limit before inserting
            enforceQueueSizeLimit()

            val event = QueuedEvent(
                eventType = eventType,
                payload = payload,
                timestamp = originalTimestamp,
                queuedAt = System.currentTimeMillis(),
                synced = false,
                retryCount = 0
            )

            val id = dao.insert(event)
            Timber.i("Event queued for offline sync: $eventType (id: $id)")
            
            return id
        } catch (e: Exception) {
            Timber.e(e, "Failed to queue event: $eventType")
            return -1
        }
    }

    /**
     * Get pending events ready for sync.
     */
    suspend fun getPendingEvents(limit: Int = 500): List<QueuedEvent> {
        return try {
            dao.getPendingEvents(limit, MAX_RETRY_COUNT)
        } catch (e: Exception) {
            Timber.e(e, "Failed to get pending events")
            emptyList()
        }
    }

    /**
     * Get pending events by type.
     */
    suspend fun getPendingEventsByType(eventType: String, limit: Int = 500): List<QueuedEvent> {
        return try {
            dao.getPendingEventsByType(eventType, limit, MAX_RETRY_COUNT)
        } catch (e: Exception) {
            Timber.e(e, "Failed to get pending events by type: $eventType")
            emptyList()
        }
    }

    /**
     * Mark events as successfully synced.
     */
    suspend fun markSynced(eventIds: List<Long>) {
        try {
            dao.markSynced(eventIds, System.currentTimeMillis())
            Timber.d("Marked ${eventIds.size} events as synced")
        } catch (e: Exception) {
            Timber.e(e, "Failed to mark events as synced")
        }
    }

    /**
     * Increment retry count for failed sync attempts.
     */
    suspend fun incrementRetryCount(eventIds: List<Long>, error: String) {
        try {
            dao.incrementRetryCount(eventIds, error)
            Timber.d("Incremented retry count for ${eventIds.size} events")
        } catch (e: Exception) {
            Timber.e(e, "Failed to increment retry count")
        }
    }

    /**
     * Get queue statistics.
     */
    suspend fun getStats(): QueueStats {
        return try {
            dao.getStats(MAX_RETRY_COUNT)
        } catch (e: Exception) {
            Timber.e(e, "Failed to get queue stats")
            QueueStats()
        }
    }

    /**
     * Flush all pending events (attempt to sync).
     * Returns number of events successfully synced.
     */
    suspend fun flush(
        syncFunction: suspend (List<QueuedEvent>) -> Result<Int>
    ): Int {
        try {
            var totalSynced = 0
            var hasMore = true

            while (hasMore) {
                val events = getPendingEvents(BATCH_SIZE)
                
                if (events.isEmpty()) {
                    hasMore = false
                    break
                }

                Timber.i("Flushing ${events.size} pending events")

                // Group events by type for efficient batch sending
                val eventsByType = events.groupBy { it.eventType }

                for ((eventType, batch) in eventsByType) {
                    val result = syncFunction(batch)
                    
                    result.onSuccess { synced ->
                        markSynced(batch.map { it.id })
                        totalSynced += synced
                        Timber.i("✓ Synced batch of $synced $eventType events")
                    }
                    
                    result.onFailure { error ->
                        incrementRetryCount(batch.map { it.id }, error.message ?: "Unknown error")
                        Timber.w("Failed to sync batch: ${error.message}")
                    }
                }

                hasMore = events.size == BATCH_SIZE
            }

            if (totalSynced > 0) {
                Timber.i("✓ Successfully synced $totalSynced offline events")
            }

            return totalSynced
        } catch (e: Exception) {
            Timber.e(e, "Failed to flush offline events")
            return 0
        }
    }

    /**
     * Enforce queue size limit by deleting oldest synced events.
     */
    private suspend fun enforceQueueSizeLimit() {
        try {
            val count = dao.getCount()
            
            if (count >= MAX_QUEUE_SIZE) {
                val deleteCount = count - MAX_QUEUE_SIZE + 1000 // Extra headroom
                dao.deleteOldestSynced(deleteCount)
                Timber.w("Queue size limit reached. Deleted $deleteCount oldest synced events")
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to enforce queue size limit")
        }
    }

    /**
     * Clean up old synced events (older than 7 days).
     */
    suspend fun cleanupOldEvents(daysOld: Int = 7) {
        try {
            val cutoffTime = System.currentTimeMillis() - (daysOld * 24 * 60 * 60 * 1000L)
            dao.deleteOlderThan(cutoffTime)
            Timber.i("Cleaned up events older than $daysOld days")
        } catch (e: Exception) {
            Timber.e(e, "Failed to cleanup old events")
        }
    }

    companion object {
        private const val MAX_QUEUE_SIZE = 100_000
        private const val BATCH_SIZE = 500
        private const val MAX_RETRY_COUNT = 5
    }
}
