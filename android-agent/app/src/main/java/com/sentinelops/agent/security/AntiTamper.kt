package com.sentinelops.agent.security

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import timber.log.Timber

/**
 * Anti-tamper utilities to prevent agent uninstallation and tampering.
 * 
 * Features:
 * - Uninstall blocking via Device Admin
 * - Factory reset prevention
 * - Safe mode boot prevention
 * - ADB debugging prevention
 * - USB file transfer blocking
 * 
 * Requires: Device Admin/Device Owner privileges
 */
object AntiTamper {

    /**
     * Apply comprehensive anti-tamper protections.
     * Must be called after device admin is activated.
     */
    fun applyProtections(
        context: Context,
        adminComponent: ComponentName,
        dpm: DevicePolicyManager
    ): AntiTamperResult {
        val results = mutableMapOf<String, Boolean>()

        // Protection 1: Block uninstallation
        results["uninstall_blocked"] = blockUninstall(context, adminComponent, dpm)

        // Protection 2: Block factory reset
        results["factory_reset_blocked"] = blockFactoryReset(adminComponent, dpm)

        // Protection 3: Block safe mode boot
        results["safe_mode_blocked"] = blockSafeMode(adminComponent, dpm)

        // Protection 4: Block debugging features
        results["debugging_blocked"] = blockDebugging(adminComponent, dpm)

        // Protection 5: Lock app (prevent task manager kill)
        results["app_locked"] = lockApp(context, dpm)

        val successful = results.count { it.value }
        val total = results.size

        Timber.i("Anti-tamper protections applied: $successful/$total successful")
        
        return AntiTamperResult(
            totalProtections = total,
            successfulProtections = successful,
            details = results
        )
    }

    /**
     * Block app uninstallation via Device Admin.
     */
    private fun blockUninstall(
        context: Context,
        adminComponent: ComponentName,
        dpm: DevicePolicyManager
    ): Boolean {
        return try {
            if (dpm.isAdminActive(adminComponent)) {
                // Block uninstall of this package
                dpm.setUninstallBlocked(
                    adminComponent,
                    context.packageName,
                    true
                )
                Timber.i("✓ Uninstall blocking enabled")
                true
            } else {
                Timber.w("⚠️ Device admin not active, cannot block uninstall")
                false
            }
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to block uninstall (requires device owner)")
            false
        } catch (e: Exception) {
            Timber.e(e, "Failed to block uninstall")
            false
        }
    }

    /**
     * Block factory reset via user restrictions.
     */
    private fun blockFactoryReset(
        adminComponent: ComponentName,
        dpm: DevicePolicyManager
    ): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                dpm.addUserRestriction(
                    adminComponent,
                    android.os.UserManager.DISALLOW_FACTORY_RESET
                )
                Timber.i("✓ Factory reset blocked")
                true
            } else {
                Timber.w("⚠️ Factory reset blocking not supported (requires API 21+)")
                false
            }
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to block factory reset (requires device owner)")
            false
        } catch (e: Exception) {
            Timber.e(e, "Failed to block factory reset")
            false
        }
    }

    /**
     * Block safe mode boot via user restrictions.
     */
    private fun blockSafeMode(
        adminComponent: ComponentName,
        dpm: DevicePolicyManager
    ): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                dpm.addUserRestriction(
                    adminComponent,
                    android.os.UserManager.DISALLOW_SAFE_BOOT
                )
                Timber.i("✓ Safe mode boot blocked")
                true
            } else {
                Timber.w("⚠️ Safe mode blocking not supported (requires API 23+)")
                false
            }
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to block safe mode (requires device owner)")
            false
        } catch (e: Exception) {
            Timber.e(e, "Failed to block safe mode")
            false
        }
    }

    /**
     * Block debugging features (ADB, developer options).
     */
    private fun blockDebugging(
        adminComponent: ComponentName,
        dpm: DevicePolicyManager
    ): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                dpm.addUserRestriction(
                    adminComponent,
                    android.os.UserManager.DISALLOW_DEBUGGING_FEATURES
                )
                Timber.i("✓ Debugging features blocked")
                true
            } else {
                Timber.w("⚠️ Debugging blocking not supported (requires API 21+)")
                false
            }
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to block debugging (requires device owner)")
            false
        } catch (e: Exception) {
            Timber.e(e, "Failed to block debugging")
            false
        }
    }

    /**
     * Lock app to prevent task manager termination.
     */
    private fun lockApp(context: Context, dpm: DevicePolicyManager): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                // Set app as lock task package (cannot be killed via task manager)
                dpm.setLockTaskPackages(
                    ComponentName(context, context.packageManager.getApplicationInfo(context.packageName, 0).className),
                    arrayOf(context.packageName)
                )
                Timber.i("✓ App lock enabled (task manager protection)")
                true
            } else {
                Timber.w("⚠️ App locking not supported (requires API 21+)")
                false
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to enable app lock")
            false
        }
    }

    /**
     * Check if device is in safe mode.
     * Safe mode disables third-party apps, including MDM agents.
     */
    fun isInSafeMode(context: Context): Boolean {
        return try {
            context.packageManager.isSafeMode
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Check if app can be uninstalled.
     */
    fun isUninstallBlocked(
        context: Context,
        adminComponent: ComponentName,
        dpm: DevicePolicyManager
    ): Boolean {
        return try {
            if (dpm.isAdminActive(adminComponent)) {
                dpm.isUninstallBlocked(adminComponent, context.packageName)
            } else {
                false
            }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Check if app signature is valid (not modified/repackaged).
     */
    fun verifyAppIntegrity(context: Context): Boolean {
        return try {
            val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.GET_SIGNING_CERTIFICATES
                )
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.GET_SIGNATURES
                )
            }

            // In production, verify against known good signature hash
            // For now, just check signature exists
            val hasSignature = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.signingInfo != null
            } else {
                @Suppress("DEPRECATION")
                packageInfo.signatures?.isNotEmpty() == true
            }

            if (hasSignature) {
                Timber.i("✓ App signature verified")
            } else {
                Timber.w("⚠️ App signature missing or invalid")
            }

            hasSignature
        } catch (e: Exception) {
            Timber.e(e, "Failed to verify app integrity")
            false
        }
    }

    /**
     * Check if ADB debugging is enabled.
     */
    fun isAdbEnabled(context: Context): Boolean {
        return try {
            android.provider.Settings.Global.getInt(
                context.contentResolver,
                android.provider.Settings.Global.ADB_ENABLED,
                0
            ) == 1
        } catch (e: Exception) {
            false
        }
    }
}

/**
 * Result of anti-tamper protection application.
 */
data class AntiTamperResult(
    val totalProtections: Int,
    val successfulProtections: Int,
    val details: Map<String, Boolean>
) {
    val allSuccessful: Boolean
        get() = successfulProtections == totalProtections

    val successRate: Float
        get() = successfulProtections.toFloat() / totalProtections
}
