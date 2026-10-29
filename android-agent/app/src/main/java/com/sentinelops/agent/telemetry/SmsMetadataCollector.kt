package com.sentinelops.agent.telemetry

import android.content.Context
import android.provider.Telephony
import android.util.Log
import java.security.MessageDigest
import java.util.Date

/**
 * SMS Metadata Collector
 * 
 * Collects SMS/MMS metadata for compliance and security monitoring.
 * 
 * PRIVACY NOTICE:
 * - Phone numbers are hashed with SHA-256 before transmission
 * - Only metadata is collected (sender/recipient, type, timestamp, count)
 * - NO MESSAGE CONTENT is captured or transmitted
 * - Complies with GDPR/CCPA metadata collection guidelines
 * - Message body is deliberately NOT accessed
 */
class SmsMetadataCollector(private val context: Context) {

    companion object {
        private const val TAG = "SmsMetadataCollector"
        
        // SMS type constants from Telephony.TextBasedSmsColumns
        const val MESSAGE_TYPE_ALL = 0
        const val MESSAGE_TYPE_INBOX = 1
        const val MESSAGE_TYPE_SENT = 2
        const val MESSAGE_TYPE_DRAFT = 3
        const val MESSAGE_TYPE_OUTBOX = 4
        const val MESSAGE_TYPE_FAILED = 5
        const val MESSAGE_TYPE_QUEUED = 6
    }

    /**
     * Collect SMS metadata since the last collection timestamp
     * 
     * @param sinceTimestamp Unix timestamp (ms) of last collection. Use 0 for all history.
     * @return List of SMS metadata entries with hashed phone numbers
     */
    fun collectSmsMetadata(sinceTimestamp: Long = 0): List<SmsMetadataEntry> {
        val smsMetadata = mutableListOf<SmsMetadataEntry>()

        try {
            // Check if permission is granted
            if (!hasSmsPermission()) {
                Log.w(TAG, "READ_SMS permission not granted")
                return emptyList()
            }

            // Query SMS content provider
            // IMPORTANT: We deliberately do NOT query the BODY column for privacy
            val projection = arrayOf(
                Telephony.Sms._ID,
                Telephony.Sms.ADDRESS,          // Phone number
                Telephony.Sms.TYPE,             // Message type (inbox, sent, etc.)
                Telephony.Sms.DATE,             // Timestamp
                Telephony.Sms.READ,             // Read status
                Telephony.Sms.SEEN,             // Seen status
                Telephony.Sms.THREAD_ID,        // Conversation thread ID
                // Telephony.Sms.BODY          // DELIBERATELY EXCLUDED for privacy
            )

            val selection = if (sinceTimestamp > 0) {
                "${Telephony.Sms.DATE} > ?"
            } else {
                null
            }

            val selectionArgs = if (sinceTimestamp > 0) {
                arrayOf(sinceTimestamp.toString())
            } else {
                null
            }

            val sortOrder = "${Telephony.Sms.DATE} DESC"

            context.contentResolver.query(
                Telephony.Sms.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )?.use { cursor ->
                val idColumn = cursor.getColumnIndex(Telephony.Sms._ID)
                val addressColumn = cursor.getColumnIndex(Telephony.Sms.ADDRESS)
                val typeColumn = cursor.getColumnIndex(Telephony.Sms.TYPE)
                val dateColumn = cursor.getColumnIndex(Telephony.Sms.DATE)
                val readColumn = cursor.getColumnIndex(Telephony.Sms.READ)
                val seenColumn = cursor.getColumnIndex(Telephony.Sms.SEEN)
                val threadIdColumn = cursor.getColumnIndex(Telephony.Sms.THREAD_ID)

                while (cursor.moveToNext()) {
                    try {
                        val id = cursor.getLong(idColumn)
                        val address = cursor.getString(addressColumn) ?: "UNKNOWN"
                        val type = cursor.getInt(typeColumn)
                        val date = cursor.getLong(dateColumn)
                        val read = if (readColumn != -1) cursor.getInt(readColumn) == 1 else false
                        val seen = if (seenColumn != -1) cursor.getInt(seenColumn) == 1 else false
                        val threadId = if (threadIdColumn != -1) cursor.getLong(threadIdColumn) else 0L

                        // Hash the phone number for privacy
                        val phoneNumberHash = hashPhoneNumber(address)

                        val entry = SmsMetadataEntry(
                            id = id,
                            phoneNumberHash = phoneNumberHash,
                            smsType = mapSmsType(type),
                            smsTypeRaw = type,
                            timestamp = Date(date),
                            isRead = read,
                            isSeen = seen,
                            threadId = threadId
                        )

                        smsMetadata.add(entry)
                    } catch (e: Exception) {
                        Log.e(TAG, "Error parsing SMS metadata entry", e)
                    }
                }
            }

            Log.i(TAG, "Collected ${smsMetadata.size} SMS metadata entries since $sinceTimestamp")
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException accessing SMS - permission denied", e)
        } catch (e: Exception) {
            Log.e(TAG, "Error collecting SMS metadata", e)
        }

        return smsMetadata
    }

    /**
     * Get SMS statistics for the last N days
     */
    fun getSmsStatistics(days: Int = 30): SmsStatistics {
        val cutoffTime = System.currentTimeMillis() - (days * 24 * 60 * 60 * 1000L)
        val smsMetadata = collectSmsMetadata(cutoffTime)

        // Group by thread to count conversations
        val uniqueThreads = smsMetadata.map { it.threadId }.distinct().size
        
        // Count messages by type
        val inboxCount = smsMetadata.count { it.smsType == "INBOX" }
        val sentCount = smsMetadata.count { it.smsType == "SENT" }
        val draftCount = smsMetadata.count { it.smsType == "DRAFT" }
        val failedCount = smsMetadata.count { it.smsType == "FAILED" }
        val queuedCount = smsMetadata.count { it.smsType == "QUEUED" }

        return SmsStatistics(
            totalMessages = smsMetadata.size,
            inboxMessages = inboxCount,
            sentMessages = sentCount,
            draftMessages = draftCount,
            failedMessages = failedCount,
            queuedMessages = queuedCount,
            uniqueContacts = smsMetadata.map { it.phoneNumberHash }.distinct().size,
            uniqueConversations = uniqueThreads,
            unreadMessages = smsMetadata.count { !it.isRead },
            periodDays = days
        )
    }

    /**
     * Get conversation activity (message count per thread)
     */
    fun getConversationActivity(days: Int = 30): List<ConversationActivity> {
        val cutoffTime = System.currentTimeMillis() - (days * 24 * 60 * 60 * 1000L)
        val smsMetadata = collectSmsMetadata(cutoffTime)

        // Group by thread ID and phone number hash
        val grouped = smsMetadata.groupBy { Pair(it.threadId, it.phoneNumberHash) }

        return grouped.map { (key, messages) ->
            ConversationActivity(
                threadId = key.first,
                phoneNumberHash = key.second,
                messageCount = messages.size,
                sentCount = messages.count { it.smsType == "SENT" },
                receivedCount = messages.count { it.smsType == "INBOX" },
                lastMessageTimestamp = messages.maxByOrNull { it.timestamp.time }?.timestamp ?: Date(0)
            )
        }.sortedByDescending { it.messageCount }
    }

    /**
     * Hash phone number using SHA-256 for privacy
     * 
     * @param phoneNumber Raw phone number or address
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
     * Map numeric SMS type to string
     */
    private fun mapSmsType(type: Int): String {
        return when (type) {
            MESSAGE_TYPE_INBOX -> "INBOX"
            MESSAGE_TYPE_SENT -> "SENT"
            MESSAGE_TYPE_DRAFT -> "DRAFT"
            MESSAGE_TYPE_OUTBOX -> "OUTBOX"
            MESSAGE_TYPE_FAILED -> "FAILED"
            MESSAGE_TYPE_QUEUED -> "QUEUED"
            MESSAGE_TYPE_ALL -> "ALL"
            else -> "UNKNOWN_$type"
        }
    }

    /**
     * Check if READ_SMS permission is granted
     */
    private fun hasSmsPermission(): Boolean {
        return try {
            context.checkSelfPermission(android.Manifest.permission.READ_SMS) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED
        } catch (e: Exception) {
            Log.e(TAG, "Error checking permission", e)
            false
        }
    }
}

/**
 * SMS metadata entry with privacy-protected data
 * 
 * IMPORTANT: No message content is included
 */
data class SmsMetadataEntry(
    val id: Long,
    val phoneNumberHash: String,          // SHA-256 hash of phone number/address
    val smsType: String,                  // "INBOX", "SENT", "DRAFT", "FAILED", etc.
    val smsTypeRaw: Int,                  // Raw type code from Telephony.Sms
    val timestamp: Date,                  // When the message was sent/received
    val isRead: Boolean,                  // Whether message has been read
    val isSeen: Boolean,                  // Whether message has been seen in UI
    val threadId: Long                    // Conversation thread ID
    // NOTE: Message body is deliberately NOT included
)

/**
 * SMS statistics summary
 */
data class SmsStatistics(
    val totalMessages: Int,
    val inboxMessages: Int,
    val sentMessages: Int,
    val draftMessages: Int,
    val failedMessages: Int,
    val queuedMessages: Int,
    val uniqueContacts: Int,              // Number of unique hashed phone numbers
    val uniqueConversations: Int,         // Number of unique thread IDs
    val unreadMessages: Int,
    val periodDays: Int                   // Period over which stats were collected
)

/**
 * Conversation activity summary
 */
data class ConversationActivity(
    val threadId: Long,
    val phoneNumberHash: String,
    val messageCount: Int,
    val sentCount: Int,
    val receivedCount: Int,
    val lastMessageTimestamp: Date
)
