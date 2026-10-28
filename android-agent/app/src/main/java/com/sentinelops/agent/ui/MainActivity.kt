package com.sentinelops.agent.ui

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.sentinelops.agent.R
import com.sentinelops.agent.admin.SentinelDeviceAdminReceiver
import com.sentinelops.agent.data.storage.SecureStorage
import com.sentinelops.agent.telemetry.HeartbeatWorker
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var storage: SecureStorage

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        storage = SecureStorage(this)

        val statusText = findViewById<TextView>(R.id.text_status)
        val deviceIdText = findViewById<TextView>(R.id.text_device_id)
        val dpcModeText = findViewById<TextView>(R.id.text_dpc_mode)
        val osText = findViewById<TextView>(R.id.text_os)
        val syncButton = findViewById<Button>(R.id.btn_sync)

        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val isDeviceOwner = dpm.isDeviceOwnerApp(packageName)
        val isProfileOwner = dpm.isProfileOwnerApp(packageName)

        val modeDescription = when {
            isDeviceOwner -> "Fully Managed Device (Device Owner)"
            isProfileOwner -> "Work Profile (Profile Owner)"
            dpm.isAdminActive(SentinelDeviceAdminReceiver.getComponentName(this)) -> "Device Admin Active"
            else -> "Unmanaged Device"
        }

        dpcModeText.text = modeDescription
        osText.text = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"

        if (storage.isEnrolled) {
            statusText.text = "PROTECTED & ENROLLED"
            statusText.setTextColor(getColor(R.color.success))
            deviceIdText.text = "Device ID: ${storage.deviceId ?: "Active"}"
        } else {
            statusText.text = "NOT ENROLLED"
            statusText.setTextColor(getColor(R.color.warning))
            deviceIdText.text = "Enroll device from SentinelOps Console (/enrollment)"
        }

        syncButton.setOnClickListener {
            val syncRequest = OneTimeWorkRequestBuilder<HeartbeatWorker>().build()
            WorkManager.getInstance(this).enqueue(syncRequest)
            Toast.makeText(this, "Telemetry synchronization triggered", Toast.LENGTH_SHORT).show()
        }
    }
}
