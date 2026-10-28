package com.sentinelops.agent.enrollment

import android.content.Context
import android.os.Build
import com.sentinelops.agent.SentinelApplication
import com.sentinelops.agent.data.model.EnrollmentRequest
import com.sentinelops.agent.data.storage.SecureStorage
import com.sentinelops.agent.network.NetworkClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber

class EnrollmentManager(
    private val context: Context,
    private val storage: SecureStorage,
    private val networkClient: NetworkClient
) {

    suspend fun enrollWithToken(token: String, customServerUrl: String? = null): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            if (!customServerUrl.isNullOrBlank()) {
                storage.serverUrl = customServerUrl
            }

            val request = EnrollmentRequest(
                enrollmentToken = token,
                deviceName = "${Build.MANUFACTURER.uppercase()}-${Build.MODEL}",
                osVersion = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
                serialNumber = try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Build.getSerial() else Build.SERIAL
                } catch (e: Exception) {
                    "UNKNOWN_SERIAL_${Build.MODEL}"
                },
                manufacturer = Build.MANUFACTURER,
                model = Build.MODEL
            )

            Timber.i("Submitting enrollment request for ${request.deviceName}...")
            val response = networkClient.apiService.registerDevice(request)

            if (response.isSuccessful && response.body() != null) {
                val data = response.body()!!
                storage.deviceId = data.deviceId
                storage.deviceKey = data.deviceKey
                storage.deviceSecret = data.deviceSecret
                storage.isEnrolled = true

                Timber.i("🎉 Device successfully enrolled! ID: ${data.deviceId}")
                
                // Initialize WebSocket connection after successful enrollment
                try {
                    val app = context.applicationContext as? SentinelApplication
                    app?.getWebSocketListener()?.connect()
                    Timber.i("WebSocket connection initiated after enrollment")
                } catch (e: Exception) {
                    Timber.w("Failed to start WebSocket after enrollment: ${e.message}")
                    // Non-critical: HTTP polling fallback will continue to work
                }
                
                Result.success(true)
            } else {
                val errorMsg = response.errorBody()?.string() ?: "Enrollment failed: HTTP ${response.code()}"
                Timber.e(errorMsg)
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Timber.e(e, "Enrollment network exception")
            Result.failure(e)
        }
    }
}
