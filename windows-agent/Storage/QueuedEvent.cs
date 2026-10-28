using System;

namespace SentinelOpsAgent.Storage;

/// <summary>
/// Represents an event queued for offline storage when network is unavailable.
/// Events are persisted to encrypted SQLite database and synced when connection restores.
/// </summary>
public class QueuedEvent
{
    /// <summary>
    /// Unique identifier for the queued event.
    /// </summary>
    public long Id { get; set; }

    /// <summary>
    /// Type of event (e.g., "heartbeat", "activity", "audit", "inventory").
    /// Used for routing to correct backend endpoint.
    /// </summary>
    public string EventType { get; set; } = string.Empty;

    /// <summary>
    /// JSON payload of the event.
    /// Encrypted at rest in SQLite database.
    /// </summary>
    public string Payload { get; set; } = string.Empty;

    /// <summary>
    /// Original timestamp when event was generated (not when queued).
    /// Preserved to maintain accurate telemetry timeline.
    /// </summary>
    public DateTime Timestamp { get; set; }

    /// <summary>
    /// UTC timestamp when event was queued to offline storage.
    /// </summary>
    public DateTime QueuedAt { get; set; }

    /// <summary>
    /// Whether event has been successfully synced to backend.
    /// 0 = pending, 1 = synced successfully.
    /// </summary>
    public int Synced { get; set; }

    /// <summary>
    /// UTC timestamp when event was successfully synced.
    /// Null if still pending.
    /// </summary>
    public DateTime? SyncedAt { get; set; }

    /// <summary>
    /// Number of sync attempts made for this event.
    /// Used for exponential backoff and eventual discard.
    /// </summary>
    public int RetryCount { get; set; }

    /// <summary>
    /// Last error message if sync failed.
    /// Useful for debugging network/backend issues.
    /// </summary>
    public string? LastError { get; set; }
}

/// <summary>
/// Event type constants for queue categorization.
/// </summary>
public static class EventTypes
{
    public const string Heartbeat = "heartbeat";
    public const string Activity = "activity";
    public const string Audit = "audit";
    public const string Inventory = "inventory";
    public const string Command = "command_result";
    public const string Telemetry = "telemetry";
}
