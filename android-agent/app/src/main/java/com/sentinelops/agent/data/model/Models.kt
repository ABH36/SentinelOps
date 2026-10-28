package com.sentinelops.agent.data.model

import com.google.gson.annotations.SerializedName

// 1. Enrollment Models
data class EnrollmentRequest(
    val enrollmentToken: String,
    val deviceName: String,
    val platform: String = "ANDROID",
    val osVersion: String,
    val serialNumber: String,
    val manufacturer: String,
    val model: String
)

data class EnrollmentResponse(
    val deviceId: String,
    val deviceKey: String,
    val deviceSecret: String,
    val tenantId: String
)

// 2. Heartbeat Models
data class HeartbeatPayload(
    val deviceKey: String,
    val deviceSecret: String,
    val health: DeviceHealth,
    val connectivity: ConnectivityHealth,
    val agent: AgentHealth
)

data class DeviceHealth(
    val cpuUsage: Double,
    val memoryUsage: Double,
    val diskUsage: Double,
    val batteryLevel: Int,
    val batteryStatus: String,
    val uptime: Long
)

data class ConnectivityHealth(
    val isConnected: Boolean,
    val connectionType: String,
    val latency: Double,
    val networkSpeed: Int
)

data class AgentHealth(
    val status: String,
    val lastCommand: String,
    val pendingCommands: Int
)

// 3. Application Usage Models
data class UsageSubmitPayload(
    val events: List<UsageEventItem>
)

data class UsageEventItem(
    val activeWindowProcess: String,
    val activeWindowTitle: String,
    val activeDurationSeconds: Long,
    val idleDurationSeconds: Long,
    val activityState: String, // ACTIVE / IDLE
    val timestamp: String
)

// 4. Remote Action Models
data class CommandPollResponse(
    val commands: List<RemoteCommandItem>
)

data class RemoteCommandItem(
    val id: String,
    val actionType: String,
    val payload: Map<String, Any>? = null,
    val parameters: Map<String, Any>? = null // Added for command parameters
)

data class CommandResultPayload(
    val commandId: String,
    val status: String, // COMPLETED / FAILED
    val result: Map<String, Any>?,
    val errorMessage: String? = null
)

// 5. Device Policy Models
data class DevicePolicy(
    val id: String? = null,
    val version: String? = null,
    val heartbeatInterval: Int? = null,
    val usageTrackingInterval: Int? = null,
    val commandPollInterval: Int? = null,
    val blacklistedApps: List<String>? = null,
    val restrictions: Map<String, Any>? = null
)
