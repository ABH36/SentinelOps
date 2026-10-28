package com.sentinelops.agent.admin

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.UserHandle
import com.sentinelops.agent.data.storage.SecureStorage
import com.sentinelops.agent.security.AntiTamper
import timber.log.Timber

/**
 * Enterprise Device Policy Controller (DPC) Receiver.
 * Handles system events, policy provisioning, password audits, and device lock notifications.
 */
class SentinelDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Timber.i("🛡️ SentinelOps Device Admin ENABLED on this device.")

        // Apply anti-tamper protections immediately
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponent = getComponentName(context)
        
        val result = AntiTamper.applyProtections(context, adminComponent, dpm)
        
        if (result.allSuccessful) {
            Timber.i("✓ All anti-tamper protections applied successfully")
        } else {
            Timber.w("⚠️ Some anti-tamper protections failed: ${result.successfulProtections}/${result.totalProtections}")
        }
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Timber.w("⚠️ SentinelOps Device Admin DISABLED.")
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        Timber.i("🚀 Android Enterprise Profile Provisioning Complete!")

        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponent = getComponentName(context)

        // Enable default enterprise policies
        try {
            dpm.setProfileName(adminComponent, "Managed Device")
            dpm.setProfileEnabled(adminComponent)

            // Apply comprehensive anti-tamper protections
            val result = AntiTamper.applyProtections(context, adminComponent, dpm)
            
            if (result.allSuccessful) {
                Timber.i("✓ All anti-tamper protections applied after provisioning")
            } else {
                Timber.w("⚠️ Some protections failed: ${result.successfulProtections}/${result.totalProtections}")
            }

            // Additional Device Owner specific protections
            if (dpm.isDeviceOwnerApp(context.packageName)) {
                // Lock task packages (cannot be killed via task manager)
                dpm.setLockTaskPackages(adminComponent, arrayOf(context.packageName))
                Timber.i("🔒 Lock task mode enabled (Device Owner)")
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to apply initial DPC baseline policies")
        }
    }

    override fun onPasswordFailed(context: Context, intent: Intent, user: UserHandle) {
        super.onPasswordFailed(context, intent, user)
        Timber.w("🚨 Consecutive failed password attempt detected.")
    }

    override fun onPasswordSucceeded(context: Context, intent: Intent, user: UserHandle) {
        super.onPasswordSucceeded(context, intent, user)
        Timber.d("✅ User successfully unlocked device.")
    }

    companion object {
        fun getComponentName(context: Context): ComponentName {
            return ComponentName(context.applicationContext, SentinelDeviceAdminReceiver::class.java)
        }
    }
}
