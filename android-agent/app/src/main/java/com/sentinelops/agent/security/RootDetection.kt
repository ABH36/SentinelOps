package com.sentinelops.agent.security

import android.os.Build
import timber.log.Timber
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader

/**
 * Root detection utilities for Android agent security.
 * 
 * Detection Methods:
 * 1. Common root management app detection (SuperSU, Magisk, etc.)
 * 2. Binary detection (su, busybox)
 * 3. Build tags inspection (test-keys = unsigned build)
 * 4. SELinux permissive mode detection
 * 5. Dangerous properties detection
 * 
 * NOTE: Root detection can be bypassed by advanced users. This is defense-in-depth,
 * not foolproof protection. Use in combination with SafetyNet/Play Integrity API.
 */
object RootDetection {

    // Common root management apps
    private val ROOT_APPS = listOf(
        "com.noshufou.android.su",
        "com.noshufou.android.su.elite",
        "eu.chainfire.supersu",
        "com.koushikdutta.superuser",
        "com.thirdparty.superuser",
        "com.yellowes.su",
        "com.topjohnwu.magisk",
        "com.kingroot.kinguser",
        "com.kingo.root",
        "com.smedialink.oneclickroot",
        "com.zhiqupk.root.global",
        "com.alephzain.framaroot"
    )

    // Common su binary locations
    private val SU_BINARY_PATHS = listOf(
        "/system/app/Superuser.apk",
        "/sbin/su",
        "/system/bin/su",
        "/system/xbin/su",
        "/data/local/xbin/su",
        "/data/local/bin/su",
        "/system/sd/xbin/su",
        "/system/bin/failsafe/su",
        "/data/local/su",
        "/su/bin/su"
    )

    // Busybox paths (common on rooted devices)
    private val BUSYBOX_PATHS = listOf(
        "/system/xbin/busybox",
        "/sbin/busybox",
        "/system/bin/busybox"
    )

    // Dangerous props
    private val DANGEROUS_PROPS = mapOf(
        "ro.debuggable" to "1",
        "ro.secure" to "0"
    )

    /**
     * Comprehensive root detection check.
     * Returns RootDetectionResult with detection details.
     */
    fun detectRoot(): RootDetectionResult {
        val indicators = mutableListOf<String>()

        // Check 1: Root management apps
        if (checkRootApps()) {
            indicators.add("ROOT_APPS_DETECTED")
            Timber.w("🚨 Root management apps detected")
        }

        // Check 2: Su binary
        val suPath = checkSuBinary()
        if (suPath != null) {
            indicators.add("SU_BINARY_FOUND:$suPath")
            Timber.w("🚨 Su binary found at: $suPath")
        }

        // Check 3: Busybox
        val busyboxPath = checkBusybox()
        if (busyboxPath != null) {
            indicators.add("BUSYBOX_FOUND:$busyboxPath")
            Timber.w("🚨 Busybox found at: $busyboxPath")
        }

        // Check 4: Build tags (test-keys = unsigned)
        if (checkTestKeys()) {
            indicators.add("TEST_KEYS_BUILD")
            Timber.w("🚨 Device built with test-keys (unsigned)")
        }

        // Check 5: SELinux permissive mode
        if (checkSeLinuxPermissive()) {
            indicators.add("SELINUX_PERMISSIVE")
            Timber.w("🚨 SELinux is in permissive mode")
        }

        // Check 6: Dangerous properties
        val dangerousProps = checkDangerousProps()
        if (dangerousProps.isNotEmpty()) {
            indicators.add("DANGEROUS_PROPS:${dangerousProps.joinToString(",")}")
            Timber.w("🚨 Dangerous properties detected: $dangerousProps")
        }

        // Check 7: Su command execution
        if (canExecuteSuCommands()) {
            indicators.add("SU_EXECUTABLE")
            Timber.w("🚨 Su commands can be executed")
        }

        val isRooted = indicators.isNotEmpty()
        
        if (isRooted) {
            Timber.w("⚠️ ROOT DETECTED: ${indicators.size} indicators found")
        } else {
            Timber.i("✓ Root detection: Device appears clean")
        }

        return RootDetectionResult(
            isRooted = isRooted,
            indicators = indicators,
            detectedAt = System.currentTimeMillis()
        )
    }

    /**
     * Check if common root management apps are installed.
     */
    private fun checkRootApps(): Boolean {
        return ROOT_APPS.any { packageName ->
            try {
                // Try to get package info - will throw exception if not installed
                android.app.ActivityThread.currentApplication()
                    .packageManager
                    .getPackageInfo(packageName, 0)
                true
            } catch (e: Exception) {
                false
            }
        }
    }

    /**
     * Check if su binary exists in common locations.
     * Returns path if found, null otherwise.
     */
    private fun checkSuBinary(): String? {
        return SU_BINARY_PATHS.firstOrNull { path ->
            try {
                val file = File(path)
                file.exists() && file.canExecute()
            } catch (e: Exception) {
                false
            }
        }
    }

    /**
     * Check if busybox exists (common on rooted devices).
     */
    private fun checkBusybox(): String? {
        return BUSYBOX_PATHS.firstOrNull { path ->
            try {
                File(path).exists()
            } catch (e: Exception) {
                false
            }
        }
    }

    /**
     * Check if device is built with test-keys (unsigned build).
     * Official ROMs are signed with release-keys.
     */
    private fun checkTestKeys(): Boolean {
        return try {
            Build.TAGS?.contains("test-keys") == true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Check if SELinux is in permissive mode.
     * Enforcing mode is default on unrooted devices.
     */
    private fun checkSeLinuxPermissive(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec("getenforce")
            val reader = BufferedReader(InputStreamReader(process.inputStream))
            val result = reader.readLine()
            process.waitFor()
            result?.trim()?.equals("Permissive", ignoreCase = true) == true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Check for dangerous system properties.
     */
    private fun checkDangerousProps(): List<String> {
        val detected = mutableListOf<String>()
        
        DANGEROUS_PROPS.forEach { (prop, dangerousValue) ->
            try {
                val value = getSystemProperty(prop)
                if (value == dangerousValue) {
                    detected.add("$prop=$value")
                }
            } catch (e: Exception) {
                // Ignore
            }
        }
        
        return detected
    }

    /**
     * Try to execute su commands.
     * If successful, device is definitely rooted.
     */
    private fun canExecuteSuCommands(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("su", "-c", "id"))
            val reader = BufferedReader(InputStreamReader(process.inputStream))
            val output = reader.readLine()
            val exitCode = process.waitFor()
            
            // If we get uid=0, we have root
            exitCode == 0 && output?.contains("uid=0") == true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Get system property value using reflection.
     */
    private fun getSystemProperty(key: String): String? {
        return try {
            val systemPropertiesClass = Class.forName("android.os.SystemProperties")
            val getMethod = systemPropertiesClass.getMethod("get", String::class.java)
            getMethod.invoke(null, key) as? String
        } catch (e: Exception) {
            null
        }
    }
}

/**
 * Result of root detection scan.
 */
data class RootDetectionResult(
    val isRooted: Boolean,
    val indicators: List<String>,
    val detectedAt: Long
)
