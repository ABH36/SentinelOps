package com.sentinelops.agent.data.storage

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update

/**
 * Data Access Object for queued events.
 * Provides methods for offline event queue management.
 */
@Dao
interface QueuedEventDao {
    
    /**
     * Insert a new event into the queue.
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(event: QueuedEvent): Long

    /**
     * Insert multiple events into the queue.
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(events: List<QueuedEvent>)

    /**
     * Get all pending (not synced) events, ordered by timestamp.
     * Limited to maxRetries to avoid infinite retry loops.
     */
    @Query("""
        SELECT * FROM queued_events 
        WHERE synced = 0 AND retryCount < :maxRetries
        ORDER BY timestamp ASC
        LIMIT :limit
    """)
    suspend fun getPendingEvents(limit: Int = 500, maxRetries: Int = 5): List<QueuedEvent>

    /**
     * Get pending events by type.
     */
    @Query("""
        SELECT * FROM queued_events 
        WHERE synced = 0 AND eventType = :eventType AND retryCount < :maxRetries
        ORDER BY timestamp ASC
        LIMIT :limit
    """)
    suspend fun getPendingEventsByType(
        eventType: String,
        limit: Int = 500,
        maxRetries: Int = 5
    ): List<QueuedEvent>

    /**
     * Mark events as successfully synced.
     */
    @Query("""
        UPDATE queued_events 
        SET synced = 1, syncedAt = :syncedAt 
        WHERE id IN (:eventIds)
    """)
    suspend fun markSynced(eventIds: List<Long>, syncedAt: Long)

    /**
     * Increment retry count for failed sync attempts.
     */
    @Query("""
        UPDATE queued_events 
        SET retryCount = retryCount + 1, lastError = :error 
        WHERE id IN (:eventIds)
    """)
    suspend fun incrementRetryCount(eventIds: List<Long>, error: String)

    /**
     * Get queue statistics.
     */
    @Query("""
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN synced = 0 THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN synced = 1 THEN 1 ELSE 0 END) as synced,
            SUM(CASE WHEN retryCount >= :maxRetries THEN 1 ELSE 0 END) as failed
        FROM queued_events
    """)
    suspend fun getStats(maxRetries: Int = 5): QueueStats

    /**
     * Delete oldest synced events to enforce queue size limit.
     */
    @Query("""
        DELETE FROM queued_events 
        WHERE id IN (
            SELECT id FROM queued_events 
            WHERE synced = 1 
            ORDER BY syncedAt ASC 
            LIMIT :deleteCount
        )
    """)
    suspend fun deleteOldestSynced(deleteCount: Int)

    /**
     * Get total event count.
     */
    @Query("SELECT COUNT(*) FROM queued_events")
    suspend fun getCount(): Int

    /**
     * Delete all events (for testing/debugging).
     */
    @Query("DELETE FROM queued_events")
    suspend fun deleteAll()

    /**
     * Delete events older than specified timestamp.
     */
    @Query("""
        DELETE FROM queued_events 
        WHERE synced = 1 AND syncedAt < :olderThan
    """)
    suspend fun deleteOlderThan(olderThan: Long)
}

/**
 * Queue statistics data class.
 */
data class QueueStats(
    val total: Int = 0,
    val pending: Int = 0,
    val synced: Int = 0,
    val failed: Int = 0
)
