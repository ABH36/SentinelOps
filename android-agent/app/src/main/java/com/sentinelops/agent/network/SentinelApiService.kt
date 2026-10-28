package com.sentinelops.agent.network

import com.sentinelops.agent.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface SentinelApiService {

    @POST("enrollment/register")
    suspend fun registerDevice(
        @Body request: EnrollmentRequest
    ): Response<EnrollmentResponse>

    @POST("heartbeat/submit")
    suspend fun submitHeartbeat(
        @Header("X-Device-Key") deviceKey: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body payload: HeartbeatPayload
    ): Response<Map<String, Any>>

    @POST("usage/submit")
    suspend fun submitUsage(
        @Header("X-Device-Key") deviceKey: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body payload: UsageSubmitPayload
    ): Response<Map<String, Any>>

    @GET("remote-actions/poll")
    suspend fun pollRemoteCommands(
        @Header("X-Device-Key") deviceKey: String,
        @Header("X-Device-Secret") deviceSecret: String
    ): Response<CommandPollResponse>

    @POST("remote-actions/result")
    suspend fun submitCommandResult(
        @Header("X-Device-Key") deviceKey: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body payload: CommandResultPayload
    ): Response<Map<String, Any>>

    @GET("policies/device-policy")
    suspend fun getDevicePolicy(
        @Header("X-Device-Key") deviceKey: String,
        @Header("X-Device-Secret") deviceSecret: String
    ): Response<DevicePolicy>
}
