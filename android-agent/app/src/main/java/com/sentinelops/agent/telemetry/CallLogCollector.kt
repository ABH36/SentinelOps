package com.sentinelops.agent.telemetry

import android.content.Context
import android.provider.CallLog
import android.util.Log
import java.security.MessageDigest
import java.util.Date

/**
 * Call Log Collector
 * 
 * Collects call metadata for compliance and security monitoring.
 * 
 * PRIVACY NOTICE:
 * - Phone numbers are hashed with SHA-256 before transmission
 * - Only metadata is collected (duration, type, timestamp)
 * - No call content or audio is captured
 * - Complies with GDPR/CCPA metadata collection guidelines
 */
class CallLogCollector(private val context: Context) {

    companion object {
        private const val TAG = "CallLogCollector"
        
        // Call type constants from CallLog.Calls
        const val CALL_TYPE_INCOMING = 1
        const val CALL_TYPE_OUTGOING = 2
        const val CALL_TYPE_MISSED = 3
        const val CALL_TYPE_VOICEMAIL = 4
        const val CALL_TYPE_REJECTED = 5
        const val CALL_TYPE_BLOCKED = 6
        const val CALL_TYPE_ANSWERED_EXTERNALLY = 7
    }

    /**
     * Collect call logs since the last collection timestamp
     * 
     * @param sinceTimestamp Unix timestamp (ms) of last collection. Use 0 for all history.
     * @return List of call log entries with hashed phone numbers
     */
    fun collectCallLogs(sinceTimestamp: Long = 0): List<CallLogEntry> {
        val callLogs = mutableListOf<CallLogEntry>()

        try {
            // Check if permission is granted
            if (!hasCallLogPermission()) {
                Log.w(TAG, "READ_CALL_LOG permission not granted")
                return emptyList()
            }

            // Query call log content provider
            val projection = arrayOf(
                CallLog.Calls._ID,
                CallLog.Calls.NUMBER,
                CallLog.Calls.TYPE,
                CallLog.Calls.DATE,
                CallLog.Calls.DURATION,
                CallLog.Calls.CACHED_NAME,
                CallLog.Calls.CACHED_NUMBER_TYPE,
                CallLog.Calls.IS_READ
            )

            val selection = if (sinceTimestamp > 0) {
                "${CallLog.Calls.DATE} > ?"
            } else {
                null
            }

            val selectionArgs = if (sinceTimestamp > 0) {
                arrayOf(sinceTimestamp.toString())
            } else {
                null
            }

            val sortOrder = "${CallLog.Calls.DATE} DESC"

            context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )?.use { cursor ->
                val idColumn = cursor.getColumnIndex(CallLog.Calls._ID)
                val numberColumn = cursor.getColumnIndex(CallLog.Calls.NUMBER)
                val typeColumn = cursor.getColumnIndex(CallLog.Calls.TYPE)
                val dateColumn = cursor.getColumnIndex(CallLog.Calls.DATE)
                val durationColumn = cursor.getColumnIndex(CallLog.Calls.DURATION)
                val nameColumn = cursor.getColumnIndex(CallLog.Calls.CACHED_NAME)
                val numberTypeColumn = cursor.getColumnIndex(CallLog.Calls.CACHED_NUMBER_TYPE)
                val isReadColumn = cursor.getColumnIndex(CallLog.Calls.IS_READ)

                while (cursor.moveToNext()) {
                    try {
                        val id = cursor.getLong(idColumn)
                        val number = cursor.getString(numberColumn) ?: "UNKNOWN"
                        val type = cursor.getInt(typeColumn)
                        val date = cursor.getLong(dateColumn)
                        val duration = cursor.getInt(durationColumn)
                        val cachedName = if (nameColumn != -1) cursor.getString(nameColumn) else null
                        val numberType = if (numberTypeColumn != -1) cursor.getInt(numberTypeColumn) else 0
                        val isRead = if (isReadColumn != -1) cursor.getInt(isReadColumn) == 1 else true

                        // Hash the phone number for privacy
                        val phoneNumberHash = hashPhoneNumber(number)

                        val entry = CallLogEntry(
                            id = id,
                            phoneNumberHash = phoneNumberHash,
                            callType = mapCallType(type),
                            callTypeRaw = type,
                            duration = duration,
                            timestamp = Date(date),
                            cachedNameAvailable = cachedName != null,
                            numberType = numberType,
                            isRead = isRead
                        )

                        callLogs.add(entry)
                    } catch (e: Exception) {
                        Log.e(TAG, "Error parsing call log entry", e)
                    }
                }
            }

            Log.i(TAG, "Collected ${callLogs.size} call log entries since $sinceTimestamp")
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException accessing call logs - permission denied", e)
        } catch (e: Exception) {
            Log.e(TAG, "Error collecting call logs", e)
        }

        return callLogs
    }

    /**
     * Get call statistics for the last N days
     */
    fun getCallStatistics(days: Int = 30): CallStatistics {
        val cutoffTime = System.currentTimeMillis() - (days * 24 * 60 * 60 * 1000L)
        val callLogs = collectCallLogs(cutoffTime)

        return CallStatistics(
            totalCalls = callLogs.size,
            incomingCalls = callLogs.count { it.callType == "INCOMING" },
            outgoingCalls = callLogs.count { it.callType == "OUTGOING" },
            missedCalls = callLogs.count { it.callType == "MISSED" },
            rejectedCalls = callLogs.count { it.callType == "REJECTED" },
            blockedCalls = callLogs.count { it.callType == "BLOCKED" },
            totalDuration = callLogs.sumOf { it.duration },
            averageDuration = if (callLogs.isNotEmpty()) callLogs.map { it.duration }.average() else 0.0,
            uniqueContacts = callLogs.map { it.phoneNumberHash }.distinct().size,
            periodDays = days
        )
    }

    /**
     * Hash phone number using SHA-256 for privacy
     * 
     * @param phoneNumber Raw phone number
     * @return Hex-encoded SHA-256 hash
     */
    private fun hashPhoneNumber(phoneNumber: String): String {
        return try {
            // Normalize phone number: remove spaces, dashes, parentheses
            val normalized = phoneNumber
                .replace(Regex("[\\s\\-\\(\\)\\+]"), "")
                .trim()

            if (normalized.isEmpty() || normalized == "UNKNOWN") {
                return "UNKNOWN"
            }

            // SHA-256 hash
            val digest = MessageDigest.getInstance("SHA-256")
            val hashBytes = digest.digest(normalized.toByteArray(Charsets.UTF_8))
            
            // Convert to hex string
            hashBytes.joinToString("") { "%02x".format(it) }
        } catch (e: Exception) {
            Log.e(TAG, "Error hashing phone number", e)
            "ERROR"
        }
    }

    /**
     * Map numeric call type to string
     */
    private fun mapCallType(type: Int): String {
        return when (type) {
            CALL_TYPE_INCOMING -> "INCOMING"
            CALL_TYPE_OUTGOING -> "OUTGOING"
            CALL_TYPE_MISSED -> "MISSED"
            CALL_TYPE_VOICEMAIL -> "VOICEMAIL"
            CALL_TYPE_REJECTED -> "REJECTED"
            CALL_TYPE_BLOCKED -> "BLOCKED"
            CALL_TYPE_ANSWERED_EXTERNALLY -> "ANSWERED_EXTERNALLY"
            else -> "UNKNOWN_$type"
        }
    }

    /**
     * Check if READ_CALL_LOG permission is granted
     */
    private fun hasCallLogPermission(): Boolean {
        return try {
            context.checkSelfPermission(android.Manifest.permission.READ_CALL_LOG) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED
        } catch (e: Exception) {
            Log.e(TAG, "Error checking permission", e)
            false
        }
    }
}

/**
 * Call log entry with privacy-protected data
 */
data class CallLogEntry(
    val id: Long,
    val phoneNumberHash: String,          // SHA-256 hash of phone number
    val callType: String,                 // "INCOMING", "OUTGOING", "MISSED", etc.
    val callTypeRaw: Int,                 // Raw type code from CallLog.Calls
    val duration: Int,                    // Duration in seconds
    val timestamp: Date,                  // When the call occurred
    val cachedNameAvailable: Boolean,     // Whether contact name was available (not transmitted)
    val numberType: Int,                  // Type of number (mobile, home, work, etc.)
    val isRead: Boolean                   // Whether call log entry has been seen by user
)

/**
 * Call statistics summary
 */
data class CallStatistics(
    val totalCalls: Int,
    val incomingCalls: Int,
    val outgoingCalls: Int,
    val missedCalls: Int,
    val rejectedCalls: Int,
    val blockedCalls: Int,
    val totalDuration: Int,               // Total duration in seconds
    val averageDuration: Double,          // Average duration in seconds
    val uniqueContacts: Int,              // Number of unique hashed phone numbers
    val periodDays: Int                   // Period over which stats were collected
)
