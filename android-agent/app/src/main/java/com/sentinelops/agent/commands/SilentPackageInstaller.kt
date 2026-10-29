package com.sentinelops.agent.commands

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import kotlin.coroutines.resume

/**
 * Silent APK installer/uninstaller using PackageInstaller API
 * 
 * Requires Device Owner or Profile Owner mode for silent installation.
 * Uses PackageInstaller.Session API for modern Android installation.
 * 
 * Key Features:
 * - Download APK from URL
 * - Silent installation (no user interaction)
 * - Silent uninstallation by package name
 * - Progress tracking
 * - Callback-based result reporting
 * 
 * Permissions Required:
 * - INSTALL_PACKAGES (system permission, requires Device Owner)
 * - DELETE_PACKAGES (system permission, requires Device Owner)
 * - REQUEST_INSTALL_PACKAGES (for Android 8.0+)
 * 
 * @constructor Creates installer with application context
 */
class SilentPackageInstaller(private val context: Context) {

    companion object {
        private const val TAG = "SilentPackageInstaller"
        
        // Intent actions for installation callbacks
        private const val ACTION_INSTALL_COMPLETE = "com.sentinelops.agent.INSTALL_COMPLETE"
        private const val ACTION_UNINSTALL_COMPLETE = "com.sentinelops.agent.UNINSTALL_COMPLETE"
        
        // Session parameters
        private const val INSTALL_SESSION_NAME = "SentinelOps_Install"
        private const val BUFFER_SIZE = 8192
    }

    private val packageInstaller: PackageInstaller = 
        context.packageManager.packageInstaller
    
    private val httpClient = OkHttpClient.Builder()
        .followRedirects(true)
        .build()

    /**
     * Download and install APK from remote URL
     * 
     * Flow:
     * 1. Download APK to local cache
     * 2. Create PackageInstaller session
     * 3. Write APK to session
     * 4. Commit session
     * 5. Wait for installation result via broadcast receiver
     * 
     * @param apkUrl Remote URL to download APK from
     * @param packageName Expected package name (for verification)
     * @return InstallResult with success status and message
     */
    suspend fun installFromUrl(apkUrl: String, packageName: String? = null): InstallResult {
        Log.i(TAG, "📦 Starting APK installation from URL: $apkUrl")
        
        return try {
            // Step 1: Download APK to cache
            val apkFile = downloadApk(apkUrl)
            
            if (!apkFile.exists() || apkFile.length() == 0L) {
                return InstallResult(
                    success = false,
                    message = "Failed to download APK or file is empty",
                    packageName = null
                )
            }
            
            Log.i(TAG, "✅ APK downloaded successfully: ${apkFile.length()} bytes")
            
            // Step 2: Install APK
            val result = installApk(apkFile, packageName)
            
            // Step 3: Cleanup
            apkFile.delete()
            
            result
        } catch (e: Exception) {
            Log.e(TAG, "❌ Installation failed", e)
            InstallResult(
                success = false,
                message = "Installation exception: ${e.message}",
                packageName = null
            )
        }
    }

    /**
     * Install APK from local file
     * 
     * Creates a PackageInstaller session with flags:
     * - INSTALL_REPLACE_EXISTING: Allow replacing existing app
     * - INSTALL_ALLOW_DOWNGRADE: Allow downgrading to older version (requires Device Owner)
     * 
     * @param apkFile Local APK file to install
     * @param expectedPackageName Expected package name for verification
     * @return InstallResult with success status
     */
    suspend fun installApk(apkFile: File, expectedPackageName: String? = null): InstallResult {
        Log.i(TAG, "📦 Installing APK from file: ${apkFile.absolutePath}")
        
        return suspendCancellableCoroutine { continuation ->
            try {
                // Create session parameters
                val params = PackageInstaller.SessionParams(
                    PackageInstaller.SessionParams.MODE_FULL_INSTALL
                ).apply {
                    // Allow replacing existing app
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        setInstallReason(PackageManager.INSTALL_REASON_DEVICE_SETUP)
                    }
                    
                    // Set app package name if known
                    if (expectedPackageName != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        setAppPackageName(expectedPackageName)
                    }
                }

                // Create installation session
                val sessionId = packageInstaller.createSession(params)
                val session = packageInstaller.openSession(sessionId)

                try {
                    // Write APK to session
                    session.openWrite(INSTALL_SESSION_NAME, 0, apkFile.length()).use { output ->
                        apkFile.inputStream().use { input ->
                            val buffer = ByteArray(BUFFER_SIZE)
                            var bytesRead: Int
                            var totalBytes = 0L
                            
                            while (input.read(buffer).also { bytesRead = it } >= 0) {
                                output.write(buffer, 0, bytesRead)
                                totalBytes += bytesRead
                                
                                // Optional: Report progress
                                val progress = (totalBytes * 100 / apkFile.length()).toInt()
                                if (progress % 20 == 0) {
                                    Log.d(TAG, "Installation progress: $progress%")
                                }
                            }
                            
                            session.fsync(output)
                        }
                    }

                    // Register broadcast receiver for result
                    val receiver = object : BroadcastReceiver() {
                        override fun onReceive(context: Context, intent: Intent) {
                            val status = intent.getIntExtra(
                                PackageInstaller.EXTRA_STATUS,
                                PackageInstaller.STATUS_FAILURE
                            )
                            
                            val packageName = intent.getStringExtra(
                                PackageInstaller.EXTRA_PACKAGE_NAME
                            )
                            
                            when (status) {
                                PackageInstaller.STATUS_SUCCESS -> {
                                    Log.i(TAG, "✅ Installation succeeded: $packageName")
                                    continuation.resume(
                                        InstallResult(
                                            success = true,
                                            message = "Installation successful",
                                            packageName = packageName
                                        )
                                    )
                                }
                                
                                PackageInstaller.STATUS_FAILURE_ABORTED -> {
                                    val message = "Installation aborted by user or system"
                                    Log.w(TAG, "⚠️ $message")
                                    continuation.resume(
                                        InstallResult(
                                            success = false,
                                            message = message,
                                            packageName = packageName
                                        )
                                    )
                                }
                                
                                PackageInstaller.STATUS_FAILURE_BLOCKED -> {
                                    val message = "Installation blocked by system policy"
                                    Log.e(TAG, "❌ $message")
                                    continuation.resume(
                                        InstallResult(
                                            success = false,
                                            message = message,
                                            packageName = packageName
                                        )
                                    )
                                }
                                
                                PackageInstaller.STATUS_FAILURE_CONFLICT -> {
                                    val message = "Installation conflict with existing package"
                                    Log.e(TAG, "❌ $message")
                                    continuation.resume(
                                        InstallResult(
                                            success = false,
                                            message = message,
                                            packageName = packageName
                                        )
                                    )
                                }
                                
                                PackageInstaller.STATUS_FAILURE_INVALID -> {
                                    val message = "APK is invalid or corrupt"
                                    Log.e(TAG, "❌ $message")
                                    continuation.resume(
                                        InstallResult(
                                            success = false,
                                            message = message,
                                            packageName = packageName
                                        )
                                    )
                                }
                                
                                PackageInstaller.STATUS_FAILURE_STORAGE -> {
                                    val message = "Insufficient storage space"
                                    Log.e(TAG, "❌ $message")
                                    continuation.resume(
                                        InstallResult(
                                            success = false,
                                            message = message,
                                            packageName = packageName
                                        )
                                    )
                                }
                                
                                else -> {
                                    val extraMessage = intent.getStringExtra(
                                        PackageInstaller.EXTRA_STATUS_MESSAGE
                                    ) ?: "Unknown error"
                                    
                                    Log.e(TAG, "❌ Installation failed: $extraMessage (status: $status)")
                                    continuation.resume(
                                        InstallResult(
                                            success = false,
                                            message = "Installation failed: $extraMessage",
                                            packageName = packageName
                                        )
                                    )
                                }
                            }
                            
                            // Unregister receiver
                            try {
                                context.unregisterReceiver(this)
                            } catch (e: Exception) {
                                Log.w(TAG, "Failed to unregister receiver", e)
                            }
                        }
                    }

                    // Register receiver
                    val intentFilter = IntentFilter(ACTION_INSTALL_COMPLETE)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        context.registerReceiver(
                            receiver,
                            intentFilter,
                            Context.RECEIVER_NOT_EXPORTED
                        )
                    } else {
                        context.registerReceiver(receiver, intentFilter)
                    }

                    // Create pending intent for callback
                    val intent = Intent(ACTION_INSTALL_COMPLETE)
                    val pendingIntent = PendingIntent.getBroadcast(
                        context,
                        sessionId,
                        intent,
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                        } else {
                            PendingIntent.FLAG_UPDATE_CURRENT
                        }
                    )

                    // Commit session (this triggers installation)
                    session.commit(pendingIntent.intentSender)
                    Log.i(TAG, "📦 Installation session committed, waiting for result...")
                    
                } catch (e: Exception) {
                    session.abandon()
                    throw e
                } finally {
                    session.close()
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Failed to create installation session", e)
                continuation.resume(
                    InstallResult(
                        success = false,
                        message = "Session creation failed: ${e.message}",
                        packageName = null
                    )
                )
            }
        }
    }

    /**
     * Uninstall app by package name
     * 
     * Uses PackageInstaller.uninstall() API which requires DELETE_PACKAGES permission
     * (system permission granted via Device Owner mode).
     * 
     * @param packageName Package name to uninstall (e.g., "com.example.app")
     * @return UninstallResult with success status
     */
    suspend fun uninstallPackage(packageName: String): UninstallResult {
        Log.i(TAG, "🗑️ Uninstalling package: $packageName")
        
        return suspendCancellableCoroutine { continuation ->
            try {
                // Check if package is installed
                try {
                    context.packageManager.getPackageInfo(packageName, 0)
                } catch (e: PackageManager.NameNotFoundException) {
                    Log.w(TAG, "⚠️ Package not found: $packageName")
                    continuation.resume(
                        UninstallResult(
                            success = false,
                            message = "Package not installed: $packageName",
                            packageName = packageName
                        )
                    )
                    return@suspendCancellableCoroutine
                }

                // Register broadcast receiver for result
                val receiver = object : BroadcastReceiver() {
                    override fun onReceive(context: Context, intent: Intent) {
                        val status = intent.getIntExtra(
                            PackageInstaller.EXTRA_STATUS,
                            PackageInstaller.STATUS_FAILURE
                        )
                        
                        val returnedPackageName = intent.getStringExtra(
                            PackageInstaller.EXTRA_PACKAGE_NAME
                        ) ?: packageName
                        
                        when (status) {
                            PackageInstaller.STATUS_SUCCESS -> {
                                Log.i(TAG, "✅ Uninstallation succeeded: $returnedPackageName")
                                continuation.resume(
                                    UninstallResult(
                                        success = true,
                                        message = "Uninstallation successful",
                                        packageName = returnedPackageName
                                    )
                                )
                            }
                            
                            PackageInstaller.STATUS_FAILURE_BLOCKED -> {
                                val message = "Uninstallation blocked (system app or device admin)"
                                Log.e(TAG, "❌ $message")
                                continuation.resume(
                                    UninstallResult(
                                        success = false,
                                        message = message,
                                        packageName = returnedPackageName
                                    )
                                )
                            }
                            
                            else -> {
                                val extraMessage = intent.getStringExtra(
                                    PackageInstaller.EXTRA_STATUS_MESSAGE
                                ) ?: "Unknown error"
                                
                                Log.e(TAG, "❌ Uninstallation failed: $extraMessage")
                                continuation.resume(
                                    UninstallResult(
                                        success = false,
                                        message = "Uninstallation failed: $extraMessage",
                                        packageName = returnedPackageName
                                    )
                                )
                            }
                        }
                        
                        // Unregister receiver
                        try {
                            context.unregisterReceiver(this)
                        } catch (e: Exception) {
                            Log.w(TAG, "Failed to unregister receiver", e)
                        }
                    }
                }

                // Register receiver
                val intentFilter = IntentFilter(ACTION_UNINSTALL_COMPLETE)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    context.registerReceiver(
                        receiver,
                        intentFilter,
                        Context.RECEIVER_NOT_EXPORTED
                    )
                } else {
                    context.registerReceiver(receiver, intentFilter)
                }

                // Create pending intent for callback
                val intent = Intent(ACTION_UNINSTALL_COMPLETE)
                val pendingIntent = PendingIntent.getBroadcast(
                    context,
                    packageName.hashCode(),
                    intent,
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                    } else {
                        PendingIntent.FLAG_UPDATE_CURRENT
                    }
                )

                // Trigger uninstallation
                packageInstaller.uninstall(packageName, pendingIntent.intentSender)
                Log.i(TAG, "🗑️ Uninstallation initiated, waiting for result...")
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Uninstallation exception", e)
                continuation.resume(
                    UninstallResult(
                        success = false,
                        message = "Uninstallation exception: ${e.message}",
                        packageName = packageName
                    )
                )
            }
        }
    }

    /**
     * Download APK from URL to local cache directory
     * 
     * @param url Remote URL to download from
     * @return Downloaded file in cache directory
     * @throws Exception if download fails
     */
    private fun downloadApk(url: String): File {
        Log.i(TAG, "⬇️ Downloading APK from: $url")
        
        val request = Request.Builder()
            .url(url)
            .build()

        httpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw Exception("Download failed: HTTP ${response.code}")
            }

            // Create temp file in cache directory
            val fileName = url.substringAfterLast("/")
                .ifEmpty { "downloaded_app.apk" }
            
            val apkFile = File(context.cacheDir, fileName)
            
            // Write response body to file
            response.body?.byteStream()?.use { input ->
                FileOutputStream(apkFile).use { output ->
                    val buffer = ByteArray(BUFFER_SIZE)
                    var bytesRead: Int
                    var totalBytes = 0L
                    
                    while (input.read(buffer).also { bytesRead = it } >= 0) {
                        output.write(buffer, 0, bytesRead)
                        totalBytes += bytesRead
                    }
                    
                    Log.i(TAG, "✅ Downloaded $totalBytes bytes")
                }
            } ?: throw Exception("Response body is null")

            return apkFile
        }
    }

    /**
     * Check if app has permission to install packages
     * 
     * For Android 8.0+ (API 26+), checks REQUEST_INSTALL_PACKAGES permission.
     * For Device Owner mode, this should always return true.
     * 
     * @return true if permission granted
     */
    fun canInstallPackages(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true // No runtime permission required on older Android versions
        }
    }

    /**
     * Get list of installed packages (for verification)
     * 
     * @return List of installed package names
     */
    fun getInstalledPackages(): List<String> {
        return context.packageManager.getInstalledPackages(0)
            .map { it.packageName }
    }

    /**
     * Check if specific package is installed
     * 
     * @param packageName Package name to check
     * @return true if installed
     */
    fun isPackageInstalled(packageName: String): Boolean {
        return try {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
    }

    /**
     * Result data class for installation operations
     */
    data class InstallResult(
        val success: Boolean,
        val message: String,
        val packageName: String?
    )

    /**
     * Result data class for uninstallation operations
     */
    data class UninstallResult(
        val success: Boolean,
        val message: String,
        val packageName: String
    )
}
