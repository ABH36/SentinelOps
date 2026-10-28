package com.sentinelops.agent.data.storage

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Hardware-backed encrypted credential and configuration store.
 * Uses AES-256-GCM backed by Android KeyStore.
 */
class SecureStorage(context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "sentinelops_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    var deviceKey: String?
        get() = prefs.getString(KEY_DEVICE_KEY, null)
        set(value) = prefs.edit().putString(KEY_DEVICE_KEY, value).apply()

    var deviceSecret: String?
        get() = prefs.getString(KEY_DEVICE_SECRET, null)
        set(value) = prefs.edit().putString(KEY_DEVICE_SECRET, value).apply()

    var deviceId: String?
        get() = prefs.getString(KEY_DEVICE_ID, null)
        set(value) = prefs.edit().putString(KEY_DEVICE_ID, value).apply()

    var serverUrl: String
        get() = prefs.getString(KEY_SERVER_URL, "http://10.0.2.2:3001/api") ?: "http://10.0.2.2:3001/api"
        set(value) = prefs.edit().putString(KEY_SERVER_URL, value).apply()

    var isEnrolled: Boolean
        get() = prefs.getBoolean(KEY_IS_ENROLLED, false)
        set(value) = prefs.edit().putBoolean(KEY_IS_ENROLLED, value).apply()

    /**
     * Save device policy locally (JSON string).
     * Note: Actual policy enforcement requires Policy Engine (TASK-032)
     */
    fun savePolicy(policy: Any) {
        // Convert policy object to JSON string for storage
        val policyJson = policy.toString() // Simplified for now, proper JSON serialization in TASK-032
        prefs.edit().putString(KEY_POLICY, policyJson).apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_DEVICE_KEY = "device_key"
        private const val KEY_DEVICE_SECRET = "device_secret"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_IS_ENROLLED = "is_enrolled"
        private const val KEY_POLICY = "device_policy"
    }
}
