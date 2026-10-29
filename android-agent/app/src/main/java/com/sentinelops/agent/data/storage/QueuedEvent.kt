package com.sentinelops.agent.data.storage

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Index

/**
 * Represents an event queued for offline storage when network is unavailable.
 * Events are persisted to encrypted Room database and synced when connection restores.
 */
@Entity(
    tableName = "queued_events",
    indices = [
        Index(value = ["synced"]),
        Index(value = ["timestamp"]),
        Index(value = ["eventType"])
    ]
)
data class QueuedEvent(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    /**
     * Type of event (e.g., "heartbeat", "activity", "audit", "inventory").
     * Used for routing to correct backend endpoint.
     */
    val eventType: String,

    /**
     * JSON payload of the event.
     * Encrypted at rest via SQLCipher.
     */
    val payload: String,

    /**
     * Original timestamp when event was generated (not when queued).
     * Preserved to maintain accurate telemetry timeline.
     */
    val timestamp: Long,

    /**
     * Timestamp when event was queued to offline storage.
     */
    val queuedAt: Long,

    /**
     * Whether event has been successfully synced to backend.
     * false = pending, true = synced successfully.
     */
    val synced: Boolean = false,

    /**
     * Timestamp when event was successfully synced.
     * Null if still pending.
     */
    val syncedAt: Long? = null,

    /**
     * Number of sync attempts made for this event.
     * Used for exponential backoff and eventual discard.
     */
    val retryCount: Int = 0,

    /**
     * Last error message if sync failed.
     * Useful for debugging network/backend issues.
     */
    val lastError: String? = null
)

/**
 * Event type constants for queue categorization.
 */
object EventTypes {
    const val HEARTBEAT = "heartbeat"
    const val ACTIVITY = "activity"
    const val AUDIT = "audit"
    const val INVENTORY = "inventory"
    const val COMMAND = "command_result"
    const val TELEMETRY = "telemetry"
    const val USAGE = "usage"
    const val CALL_LOG = "call_log"
    const val SMS_METADATA = "sms_metadata"
    const val APP_USAGE = "app_usage"
}
