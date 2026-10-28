using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using Serilog;

namespace SentinelOpsAgent.Activity;

/// <summary>
/// Media Device Activity Monitor
/// 
/// Monitors microphone and camera usage on Windows endpoints.
/// Tracks which applications are actively using audio capture devices (microphones)
/// and camera devices (webcams) for privacy and security monitoring.
/// 
/// Security Use Cases:
/// - Unauthorized microphone access detection (spyware, malware)
/// - Unauthorized camera access detection (surveillance malware)
/// - Privacy compliance monitoring
/// - Data exfiltration via audio/video
/// - Meeting/call monitoring for corporate policy enforcement
/// 
/// Implementation:
/// - Microphone: Core Audio API (MMDeviceEnumerator, IAudioSessionManager2)
/// - Camera: Windows Registry (CapabilityAccessManager\ConsentStore\webcam)
/// 
/// Performance:
/// - Check frequency: Every 60 seconds
/// - CPU: < 0.5% (registry + COM queries)
/// - Memory: ~3-5 MB
/// </summary>
public class MediaDeviceActivityMonitor : IDisposable
{
    private readonly ILogger _logger;
    private readonly Dictionary<string, MediaActivity> _lastKnownState;
    private bool _disposed = false;

    // COM GUIDs for Core Audio API
    private static readonly Guid CLSID_MMDeviceEnumerator = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
    private static readonly Guid IID_IMMDeviceEnumerator = new Guid("A95664D2-9614-4F35-A746-DE8DB63617E6");
    private static readonly Guid IID_IAudioSessionManager2 = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");

    public MediaDeviceActivityMonitor(ILogger? logger = null)
    {
        _logger = logger ?? Log.Logger;
        _lastKnownState = new Dictionary<string, MediaActivity>();
    }

    /// <summary>
    /// Check for active microphone and camera usage
    /// Returns list of currently active media devices
    /// </summary>
    public List<MediaActivity> CheckMediaActivity()
    {
        var activities = new List<MediaActivity>();

        try
        {
            // Check microphone activity
            var microphoneActivities = CheckMicrophoneActivity();
            activities.AddRange(microphoneActivities);

            // Check camera activity
            var cameraActivities = CheckCameraActivity();
            activities.AddRange(cameraActivities);

            _logger.Debug("Media activity check completed: {MicCount} microphone, {CamCount} camera",
                microphoneActivities.Count, cameraActivities.Count);
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Failed to check media activity");
        }

        return activities;
    }

    /// <summary>
    /// Check for active microphone sessions using Core Audio API
    /// </summary>
    private List<MediaActivity> CheckMicrophoneActivity()
    {
        var activities = new List<MediaActivity>();

        try
        {
            // Create MMDeviceEnumerator
            var deviceEnumeratorType = Type.GetTypeFromCLSID(CLSID_MMDeviceEnumerator);
            if (deviceEnumeratorType == null)
            {
                _logger.Warning("Core Audio API not available");
                return activities;
            }

            var deviceEnumerator = Activator.CreateInstance(deviceEnumeratorType);
            var enumeratorInterface = (IMMDeviceEnumerator)deviceEnumerator;

            // Get default audio capture device (microphone)
            enumeratorInterface.GetDefaultAudioEndpoint(EDataFlow.eCapture, ERole.eMultimedia, out var device);

            if (device != null)
            {
                // Get audio session manager
                var iid = IID_IAudioSessionManager2;
                device.Activate(ref iid, 0, IntPtr.Zero, out var sessionManagerObj);
                var sessionManager = (IAudioSessionManager2)sessionManagerObj;

                // Get audio session enumerator
                sessionManager.GetSessionEnumerator(out var sessionEnumerator);
                sessionEnumerator.GetCount(out var sessionCount);

                // Enumerate active audio sessions
                for (int i = 0; i < sessionCount; i++)
                {
                    sessionEnumerator.GetSession(i, out var session);
                    
                    // Get session state
                    session.GetState(out var state);

                    // Only interested in active sessions
                    if (state == AudioSessionState.Active)
                    {
                        // Get process ID
                        session.GetProcessId(out var processId);

                        if (processId > 0)
                        {
                            try
                            {
                                var process = Process.GetProcessById((int)processId);
                                var activity = new MediaActivity
                                {
                                    DeviceType = "Microphone",
                                    ProcessId = (int)processId,
                                    ProcessName = process.ProcessName,
                                    ProcessPath = GetProcessPath(process),
                                    IsActive = true,
                                    DetectedAt = DateTime.UtcNow
                                };

                                activities.Add(activity);

                                _logger.Debug("Active microphone session: {ProcessName} (PID: {ProcessId})",
                                    process.ProcessName, processId);
                            }
                            catch (ArgumentException)
                            {
                                // Process no longer exists
                                _logger.Debug("Microphone session process {ProcessId} no longer exists", processId);
                            }
                            catch (Exception ex)
                            {
                                _logger.Debug(ex, "Failed to get process info for PID {ProcessId}", processId);
                            }
                        }
                    }

                    Marshal.ReleaseComObject(session);
                }

                Marshal.ReleaseComObject(sessionEnumerator);
                Marshal.ReleaseComObject(sessionManager);
                Marshal.ReleaseComObject(device);
            }

            Marshal.ReleaseComObject(deviceEnumerator);
        }
        catch (COMException ex)
        {
            _logger.Debug(ex, "COM error checking microphone activity");
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Failed to check microphone activity");
        }

        return activities;
    }

    /// <summary>
    /// Check for active camera usage via Windows Registry
    /// </summary>
    private List<MediaActivity> CheckCameraActivity()
    {
        var activities = new List<MediaActivity>();

        try
        {
            const string registryPath = @"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam";

            using var baseKey = Registry.CurrentUser.OpenSubKey(registryPath);
            if (baseKey == null)
            {
                _logger.Debug("Camera consent registry key not found");
                return activities;
            }

            // Enumerate all app subkeys
            var appKeys = baseKey.GetSubKeyNames();

            foreach (var appKey in appKeys)
            {
                if (appKey.StartsWith("NonPackaged", StringComparison.OrdinalIgnoreCase))
                {
                    // Check NonPackaged apps (traditional desktop apps)
                    using var nonPackagedKey = baseKey.OpenSubKey(appKey);
                    if (nonPackagedKey != null)
                    {
                        var subKeys = nonPackagedKey.GetSubKeyNames();
                        foreach (var subKey in subKeys)
                        {
                            var activity = CheckCameraAppActivity(nonPackagedKey, subKey);
                            if (activity != null)
                            {
                                activities.Add(activity);
                            }
                        }
                    }
                }
                else
                {
                    // Check packaged apps (UWP apps)
                    var activity = CheckCameraAppActivity(baseKey, appKey);
                    if (activity != null)
                    {
                        activities.Add(activity);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Failed to check camera activity");
        }

        return activities;
    }

    /// <summary>
    /// Check if a specific app is actively using the camera
    /// </summary>
    private MediaActivity? CheckCameraAppActivity(RegistryKey parentKey, string appKey)
    {
        try
        {
            using var appRegistryKey = parentKey.OpenSubKey(appKey);
            if (appRegistryKey == null) return null;

            // Get LastUsedTimeStop value
            // If LastUsedTimeStop = 0, camera is currently active
            var lastUsedTimeStop = appRegistryKey.GetValue("LastUsedTimeStop");

            if (lastUsedTimeStop is long stopTime && stopTime == 0)
            {
                // Camera is active
                var lastUsedTimeStart = appRegistryKey.GetValue("LastUsedTimeStart");
                var startTime = lastUsedTimeStart is long start ? start : 0;

                // Convert file time to DateTime
                var startDateTime = startTime > 0 ? DateTime.FromFileTimeUtc(startTime) : DateTime.UtcNow;

                // Try to get process information
                var processInfo = GetProcessFromAppKey(appKey);

                var activity = new MediaActivity
                {
                    DeviceType = "Camera",
                    ProcessId = processInfo.ProcessId,
                    ProcessName = processInfo.ProcessName,
                    ProcessPath = processInfo.ProcessPath,
                    AppPackageName = appKey,
                    IsActive = true,
                    DetectedAt = DateTime.UtcNow,
                    ActiveSince = startDateTime
                };

                _logger.Debug("Active camera session: {AppName}", appKey);

                return activity;
            }
        }
        catch (Exception ex)
        {
            _logger.Debug(ex, "Failed to check camera activity for app {AppKey}", appKey);
        }

        return null;
    }

    /// <summary>
    /// Try to get process information from app registry key
    /// </summary>
    private (int ProcessId, string ProcessName, string ProcessPath) GetProcessFromAppKey(string appKey)
    {
        try
        {
            // For NonPackaged apps, the key format is like:
            // C:#Users#Username#AppData#Local#Program#app.exe
            if (appKey.Contains("#"))
            {
                var pathParts = appKey.Split('#');
                var exeName = pathParts[pathParts.Length - 1];
                var processName = System.IO.Path.GetFileNameWithoutExtension(exeName);

                // Try to find running process
                var processes = Process.GetProcessesByName(processName);
                if (processes.Length > 0)
                {
                    var process = processes[0];
                    return (process.Id, process.ProcessName, GetProcessPath(process));
                }

                return (0, processName, appKey.Replace('#', '\\'));
            }

            // For packaged apps (UWP), return package name
            return (0, appKey, appKey);
        }
        catch
        {
            return (0, appKey, appKey);
        }
    }

    /// <summary>
    /// Get full path of a process
    /// </summary>
    private string GetProcessPath(Process process)
    {
        try
        {
            return process.MainModule?.FileName ?? process.ProcessName;
        }
        catch
        {
            return process.ProcessName;
        }
    }

    /// <summary>
    /// Detect changes in media activity (new activity or stopped activity)
    /// </summary>
    public List<MediaActivity> DetectChanges(List<MediaActivity> currentActivities)
    {
        var changes = new List<MediaActivity>();

        try
        {
            // Build current state map
            var currentState = currentActivities
                .ToDictionary(a => $"{a.DeviceType}:{a.ProcessName}:{a.ProcessId}", a => a);

            // Detect new activities
            foreach (var current in currentState)
            {
                if (!_lastKnownState.ContainsKey(current.Key))
                {
                    // New activity started
                    changes.Add(current.Value);
                    _logger.Information("New {DeviceType} activity detected: {ProcessName}",
                        current.Value.DeviceType, current.Value.ProcessName);
                }
            }

            // Detect stopped activities
            foreach (var last in _lastKnownState)
            {
                if (!currentState.ContainsKey(last.Key))
                {
                    // Activity stopped
                    var stoppedActivity = last.Value;
                    stoppedActivity.IsActive = false;
                    stoppedActivity.StoppedAt = DateTime.UtcNow;
                    changes.Add(stoppedActivity);

                    _logger.Information("{DeviceType} activity stopped: {ProcessName}",
                        stoppedActivity.DeviceType, stoppedActivity.ProcessName);
                }
            }

            // Update last known state
            _lastKnownState.Clear();
            foreach (var kvp in currentState)
            {
                _lastKnownState[kvp.Key] = kvp.Value;
            }
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Failed to detect media activity changes");
        }

        return changes;
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _lastKnownState.Clear();
            _disposed = true;
        }
    }

    #region Core Audio API Interfaces

    [ComImport]
    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(EDataFlow dataFlow, uint dwStateMask, out IMMDeviceCollection ppDevices);
        int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice ppEndpoint);
        int GetDevice(string pwstrId, out IMMDevice ppDevice);
        int RegisterEndpointNotificationCallback(IntPtr pClient);
        int UnregisterEndpointNotificationCallback(IntPtr pClient);
    }

    [ComImport]
    [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceCollection
    {
        int GetCount(out uint pcDevices);
        int Item(uint nDevice, out IMMDevice ppDevice);
    }

    [ComImport]
    [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, out object ppInterface);
        int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
        int GetId(out string ppstrId);
        int GetState(out int pdwState);
    }

    [ComImport]
    [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionManager2
    {
        int GetAudioSessionControl(ref Guid AudioSessionGuid, int StreamFlags, out IntPtr SessionControl);
        int GetSimpleAudioVolume(ref Guid AudioSessionGuid, int StreamFlags, out IntPtr AudioVolume);
        int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
        int RegisterSessionNotification(IntPtr SessionNotification);
        int UnregisterSessionNotification(IntPtr SessionNotification);
        int RegisterDuckNotification(string sessionID, IntPtr duckNotification);
        int UnregisterDuckNotification(IntPtr duckNotification);
    }

    [ComImport]
    [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionEnumerator
    {
        int GetCount(out int SessionCount);
        int GetSession(int SessionCount, out IAudioSessionControl2 Session);
    }

    [ComImport]
    [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl2
    {
        // IAudioSessionControl methods
        int GetState(out AudioSessionState pRetVal);
        int GetDisplayName(out string pRetVal);
        int SetDisplayName(string Value, ref Guid EventContext);
        int GetIconPath(out string pRetVal);
        int SetIconPath(string Value, ref Guid EventContext);
        int GetGroupingParam(out Guid pRetVal);
        int SetGroupingParam(ref Guid Override, ref Guid EventContext);
        int RegisterAudioSessionNotification(IntPtr NewNotifications);
        int UnregisterAudioSessionNotification(IntPtr NewNotifications);

        // IAudioSessionControl2 methods
        int GetSessionIdentifier(out string pRetVal);
        int GetSessionInstanceIdentifier(out string pRetVal);
        int GetProcessId(out uint pRetVal);
        int IsSystemSoundsSession();
        int SetDuckingPreference(bool optOut);
    }

    private enum EDataFlow
    {
        eRender = 0,
        eCapture = 1,
        eAll = 2
    }

    private enum ERole
    {
        eConsole = 0,
        eMultimedia = 1,
        eCommunications = 2
    }

    private enum AudioSessionState
    {
        Inactive = 0,
        Active = 1,
        Expired = 2
    }

    #endregion
}

/// <summary>
/// Represents media device activity (microphone or camera usage)
/// </summary>
public class MediaActivity
{
    /// <summary>
    /// Device type: "Microphone" or "Camera"
    /// </summary>
    public string DeviceType { get; set; } = string.Empty;

    /// <summary>
    /// Process ID using the device (0 if not available)
    /// </summary>
    public int ProcessId { get; set; }

    /// <summary>
    /// Process name using the device
    /// </summary>
    public string ProcessName { get; set; } = string.Empty;

    /// <summary>
    /// Full path to process executable
    /// </summary>
    public string ProcessPath { get; set; } = string.Empty;

    /// <summary>
    /// App package name (for UWP apps)
    /// </summary>
    public string? AppPackageName { get; set; }

    /// <summary>
    /// Whether device is currently active
    /// </summary>
    public bool IsActive { get; set; }

    /// <summary>
    /// When activity was detected
    /// </summary>
    public DateTime DetectedAt { get; set; }

    /// <summary>
    /// When activity started (for camera, from registry timestamp)
    /// </summary>
    public DateTime? ActiveSince { get; set; }

    /// <summary>
    /// When activity stopped
    /// </summary>
    public DateTime? StoppedAt { get; set; }
}
