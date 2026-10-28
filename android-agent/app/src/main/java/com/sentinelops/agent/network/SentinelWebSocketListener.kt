package com.sentinelops.agent.network

import android.content.Context
import android.util.Log
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.sentinelops.agent.commands.RemoteCommandWorker
import com.sentinelops.agent.data.storage.SecureStorage
import kotlinx.coroutines.*
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * WebSocket client for real-time command delivery from SentinelOps backend.
 * 
 * Features:
 * - Persistent WebSocket connection with automatic reconnection
 * - Exponential backoff strategy (5s → 10s → 30s → 60s → 120s max)
 * - HTTP polling fallback via WorkManager (existing RemoteCommandWorker)
 * - Secure authentication using device credentials
 * - Command acknowledgment and result reporting
 * 
 * Security:
 * - TLS 1.2+ for WebSocket connections
 * - Device credentials (X-Device-Key, X-Device-Secret) for authentication
 * - Socket.IO protocol for structured messaging
 * - Automatic disconnection on credential errors
 * 
 * @property context Application context
 * @property secureStorage Storage for device credentials
 * @property baseUrl Backend base URL (e.g., "https://api.sentinelops.com")
 */
class SentinelWebSocketListener(
    private val context: Context,
    private val secureStorage: SecureStorage,
    private val baseUrl: String
) {
    companion object {
        private const val TAG = "SentinelWebSocket"
        private const val SOCKET_PATH = "/agent-gateway"
        
        // Reconnection delays in milliseconds
        private val RECONNECT_DELAYS = listOf(
            5_000L,      // 5 seconds
            10_000L,     // 10 seconds
            30_000L,     // 30 seconds
            60_000L,     // 1 minute
            120_000L     // 2 minutes (max)
        )
        
        // Ping/pong timeout
        private const val PING_INTERVAL_MS = 30_000L
        private const val PING_TIMEOUT_MS = 10_000L
    }
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // No read timeout for persistent connection
        .writeTimeout(15, TimeUnit.SECONDS)
        .pingInterval(PING_INTERVAL_MS, TimeUnit.MILLISECONDS)
        .build()
    
    private var webSocket: WebSocket? = null
    private val reconnectAttempt = AtomicInteger(0)
    private val isConnected = AtomicBoolean(false)
    private val shouldReconnect = AtomicBoolean(true)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    private var reconnectJob: Job? = null
    
    /**
     * Start WebSocket connection to backend gateway.
     * Called once at application startup or after device enrollment.
     */
    fun connect() {
        if (isConnected.get()) {
            Log.d(TAG, "Already connected, skipping")
            return
        }
        
        val deviceKey = secureStorage.getDeviceKey()
        val deviceSecret = secureStorage.getDeviceSecret()
        
        if (deviceKey.isNullOrEmpty() || deviceSecret.isNullOrEmpty()) {
            Log.w(TAG, "Device not enrolled, cannot connect to WebSocket")
            return
        }
        
        shouldReconnect.set(true)
        initiateConnection(deviceKey, deviceSecret)
    }
    
    /**
     * Disconnect WebSocket and stop reconnection attempts.
     * Called when device is unenrolled or app is shutting down.
     */
    fun disconnect() {
        Log.i(TAG, "Disconnecting WebSocket")
        shouldReconnect.set(false)
        reconnectJob?.cancel()
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        isConnected.set(false)
    }
    
    /**
     * Send command execution result back to backend.
     * 
     * @param commandId Original command ID
     * @param success Whether command succeeded
     * @param output Command output or error message
     */
    fun sendCommandResult(commandId: String, success: Boolean, output: String) {
        val socket = webSocket
        if (socket == null || !isConnected.get()) {
            Log.w(TAG, "WebSocket not connected, cannot send result for command $commandId")
            return
        }
        
        try {
            val payload = JSONObject().apply {
                put("commandId", commandId)
                put("success", success)
                put("output", output)
                put("timestamp", System.currentTimeMillis())
            }
            
            // Socket.IO format: ["event_name", {data}]
            val message = """["command:result",${payload}]"""
            
            if (socket.send(message)) {
                Log.d(TAG, "Sent result for command $commandId")
            } else {
                Log.e(TAG, "Failed to send result for command $commandId")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error sending command result: ${e.message}", e)
        }
    }
    
    /**
     * Initiate WebSocket connection with authentication headers.
     */
    private fun initiateConnection(deviceKey: String, deviceSecret: String) {
        try {
            // Convert HTTP(S) URL to WS(S) URL
            val wsUrl = baseUrl
                .replace("http://", "ws://")
                .replace("https://", "wss://") + SOCKET_PATH
            
            Log.i(TAG, "Connecting to WebSocket: $wsUrl")
            
            val request = Request.Builder()
                .url(wsUrl)
                .addHeader("X-Device-Key", deviceKey)
                .addHeader("X-Device-Secret", deviceSecret)
                .build()
            
            webSocket = client.newWebSocket(request, SocketListener())
            
        } catch (e: Exception) {
            Log.e(TAG, "Error initiating connection: ${e.message}", e)
            scheduleReconnect()
        }
    }
    
    /**
     * Schedule reconnection with exponential backoff.
     */
    private fun scheduleReconnect() {
        if (!shouldReconnect.get()) {
            Log.d(TAG, "Reconnection disabled, not scheduling")
            return
        }
        
        reconnectJob?.cancel()
        
        val attempt = reconnectAttempt.getAndIncrement()
        val delayIndex = minOf(attempt, RECONNECT_DELAYS.size - 1)
        val delay = RECONNECT_DELAYS[delayIndex]
        
        Log.i(TAG, "Scheduling reconnection attempt ${attempt + 1} in ${delay}ms")
        
        reconnectJob = scope.launch {
            delay(delay)
            
            if (shouldReconnect.get() && !isConnected.get()) {
                val deviceKey = secureStorage.getDeviceKey()
                val deviceSecret = secureStorage.getDeviceSecret()
                
                if (!deviceKey.isNullOrEmpty() && !deviceSecret.isNullOrEmpty()) {
                    initiateConnection(deviceKey, deviceSecret)
                } else {
                    Log.w(TAG, "Device credentials missing, stopping reconnection")
                    shouldReconnect.set(false)
                }
            }
        }
    }
    
    /**
     * Handle incoming command from backend.
     * Parses Socket.IO message format and executes command via WorkManager.
     */
    private fun handleCommand(message: String) {
        try {
            Log.d(TAG, "Received command: $message")
            
            // Parse Socket.IO format: ["command", {data}]
            // We need to extract the JSON object from the array
            val trimmed = message.trim()
            if (!trimmed.startsWith("[\"command\",") && !trimmed.startsWith("['command',")) {
                Log.w(TAG, "Unknown message format: $message")
                return
            }
            
            // Extract JSON object (everything after "command",)
            val jsonStart = trimmed.indexOf('{')
            val jsonEnd = trimmed.lastIndexOf('}')
            
            if (jsonStart == -1 || jsonEnd == -1) {
                Log.e(TAG, "Invalid command format: $message")
                return
            }
            
            val commandJson = trimmed.substring(jsonStart, jsonEnd + 1)
            val commandObj = JSONObject(commandJson)
            
            val commandId = commandObj.optString("commandId", "")
            val commandType = commandObj.optString("command", "")
            val parameters = commandObj.optJSONObject("parameters")?.toString() ?: "{}"
            
            if (commandId.isEmpty() || commandType.isEmpty()) {
                Log.e(TAG, "Missing commandId or command type")
                return
            }
            
            Log.i(TAG, "Executing command: $commandType (ID: $commandId)")
            
            // Execute command via WorkManager (reuse existing RemoteCommandWorker)
            val inputData = Data.Builder()
                .putString("command_id", commandId)
                .putString("command_type", commandType)
                .putString("parameters", parameters)
                .putBoolean("websocket_initiated", true)
                .build()
            
            val commandWork = OneTimeWorkRequestBuilder<RemoteCommandWorker>()
                .setInputData(inputData)
                .build()
            
            WorkManager.getInstance(context).enqueue(commandWork)
            
            // Send immediate acknowledgment
            sendCommandAck(commandId)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error handling command: ${e.message}", e)
        }
    }
    
    /**
     * Send command acknowledgment (received but not yet executed).
     */
    private fun sendCommandAck(commandId: String) {
        val socket = webSocket
        if (socket == null || !isConnected.get()) return
        
        try {
            val payload = JSONObject().apply {
                put("commandId", commandId)
                put("acknowledged", true)
                put("timestamp", System.currentTimeMillis())
            }
            
            val message = """["command:ack",${payload}]"""
            socket.send(message)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error sending acknowledgment: ${e.message}", e)
        }
    }
    
    /**
     * WebSocket event listener.
     */
    private inner class SocketListener : WebSocketListener() {
        
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.i(TAG, "WebSocket connected: ${response.code}")
            isConnected.set(true)
            reconnectAttempt.set(0) // Reset backoff counter
            
            // Send initial heartbeat
            try {
                val heartbeat = JSONObject().apply {
                    put("type", "heartbeat")
                    put("timestamp", System.currentTimeMillis())
                }
                val message = """["heartbeat",${heartbeat}]"""
                webSocket.send(message)
            } catch (e: Exception) {
                Log.e(TAG, "Error sending initial heartbeat: ${e.message}")
            }
        }
        
        override fun onMessage(webSocket: WebSocket, text: String) {
            Log.d(TAG, "Received message: $text")
            
            // Route message based on Socket.IO event type
            when {
                text.contains("\"command\"") -> handleCommand(text)
                text.contains("\"ping\"") -> {
                    // Respond to ping
                    try {
                        val pong = """["pong",{"timestamp":${System.currentTimeMillis()}}]"""
                        webSocket.send(pong)
                    } catch (e: Exception) {
                        Log.e(TAG, "Error sending pong: ${e.message}")
                    }
                }
                text.contains("\"disconnect\"") -> {
                    Log.w(TAG, "Server requested disconnect")
                    disconnect()
                }
                else -> {
                    Log.d(TAG, "Unhandled message type: $text")
                }
            }
        }
        
        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            Log.i(TAG, "WebSocket closing: code=$code, reason=$reason")
            webSocket.close(1000, null)
        }
        
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.i(TAG, "WebSocket closed: code=$code, reason=$reason")
            isConnected.set(false)
            
            // Reconnect unless explicitly disconnected
            if (shouldReconnect.get()) {
                scheduleReconnect()
            }
        }
        
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.e(TAG, "WebSocket failure: ${t.message}", t)
            Log.e(TAG, "Response: ${response?.code} ${response?.message}")
            
            isConnected.set(false)
            
            // Check for authentication errors (don't reconnect)
            if (response?.code == 401 || response?.code == 403) {
                Log.e(TAG, "Authentication failed, stopping reconnection")
                shouldReconnect.set(false)
                return
            }
            
            // Schedule reconnection for other errors
            if (shouldReconnect.get()) {
                scheduleReconnect()
            }
        }
    }
    
    /**
     * Clean up resources.
     * Call this when the service/application is destroyed.
     */
    fun cleanup() {
        disconnect()
        scope.cancel()
        client.dispatcher.executorService.shutdown()
        client.connectionPool.evictAll()
    }
}
