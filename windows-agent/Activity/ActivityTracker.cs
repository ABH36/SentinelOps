using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Extensions.Options;
using Serilog;
using SentinelOpsAgent.Config;
using SentinelOpsAgent.Security;
using SentinelOpsAgent.Storage;

namespace SentinelOpsAgent.Activity;

public class ActivityTracker : IDisposable
{
    private readonly ILogger _logger;
    private readonly AgentConfig _config;
    private readonly CommunicationClient _client;
    private readonly OfflineBuffer? _offlineBuffer;
    private readonly ClipboardMonitor _clipboardMonitor;
    private readonly BrowserHistoryCollector? _browserHistoryCollector;
    private readonly PrintSpoolerMonitor? _printSpoolerMonitor;
    private readonly FileSystemWatcherService? _fileSystemWatcher;
    private readonly UsbEventMonitor? _usbEventMonitor;
    private readonly WifiScanner? _wifiScanner;
    private readonly BluetoothScanner? _bluetoothScanner;
    private readonly MediaDeviceActivityMonitor? _mediaDeviceMonitor;
    private readonly SecurityEventCollector? _securityEventCollector;
    private DateTime _lastBrowserHistoryCollection = DateTime.MinValue;
    private DateTime _lastWifiScan = DateTime.MinValue;
    private DateTime _lastBluetoothScan = DateTime.MinValue;
    private DateTime _lastMediaDeviceCheck = DateTime.MinValue;
    private DateTime _lastSecurityEventCollection = DateTime.MinValue;

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    [StructLayout(LayoutKind.Sequential)]
    private struct LASTINPUTINFO
    {
        public static readonly int SizeOf = Marshal.SizeOf(typeof(LASTINPUTINFO));
        [MarshalAs(UnmanagedType.U4)]
        public int cbSize;
        [MarshalAs(UnmanagedType.U4)]
        public uint dwTime;
    }

    public ActivityTracker(
        ILogger logger,
        IOptions<AgentConfig> config,
        CommunicationClient client,
        OfflineBuffer? offlineBuffer = null)
    {
        _logger = logger;
        _config = config.Value;
        _client = client;
        _offlineBuffer = offlineBuffer;
        
        // Initialize clipboard monitor
        if (offlineBuffer != null)
        {
            _clipboardMonitor = new ClipboardMonitor(_logger, offlineBuffer);
            _browserHistoryCollector = new BrowserHistoryCollector(_logger, offlineBuffer);
            _printSpoolerMonitor = new PrintSpoolerMonitor();
            _fileSystemWatcher = new FileSystemWatcherService();
            _usbEventMonitor = new UsbEventMonitor();
            _wifiScanner = new WifiScanner(_logger);
            _bluetoothScanner = new BluetoothScanner(_logger);
            _mediaDeviceMonitor = new MediaDeviceActivityMonitor(_logger);
            _securityEventCollector = new SecurityEventCollector(_logger);
        }
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.Information("Starting activity and productivity evidence monitor...");

        // Start clipboard monitor
        if (_clipboardMonitor != null)
        {
            try
            {
                _clipboardMonitor.Start();
                _logger.Information("Clipboard monitor started successfully");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to start clipboard monitor");
            }
        }

        // Start print spooler monitor
        if (_printSpoolerMonitor != null)
        {
            try
            {
                _printSpoolerMonitor.StartMonitoring(async (printJob) =>
                {
                    try
                    {
                        // Queue print job event to offline buffer
                        var payload = new
                        {
                            jobId = printJob.JobId,
                            documentName = printJob.DocumentName,
                            printerName = printJob.PrinterName,
                            owner = printJob.Owner,
                            totalPages = printJob.TotalPages,
                            jobStatus = printJob.JobStatus,
                            dataType = printJob.DataType,
                            driverName = printJob.DriverName,
                            fileSize = printJob.FileSize,
                            timeSubmitted = printJob.TimeSubmitted.ToString("o"),
                            detectedAt = printJob.DetectedAt.ToString("o")
                        };

                        // Queue to offline buffer for resilient delivery
                        if (_offlineBuffer != null)
                        {
                            await _offlineBuffer.QueueAsync(EventTypes.PrintJob, payload, printJob.DetectedAt);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.Error(ex, "Failed to queue print job event");
                    }
                });

                _logger.Information("Print spooler monitor started successfully");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to start print spooler monitor");
            }
        }

        // Start file system watcher
        if (_fileSystemWatcher != null)
        {
            try
            {
                _fileSystemWatcher.StartMonitoring(async (batch) =>
                {
                    try
                    {
                        // Queue file change events batch to offline buffer
                        var events = batch.Select(e => new
                        {
                            changeType = e.ChangeType,
                            filePath = e.FilePath,
                            oldPath = e.OldPath,
                            fileSize = e.FileSize,
                            fileExtension = e.FileExtension,
                            detectedAt = e.DetectedAt.ToString("o")
                        }).ToList();

                        var payload = new
                        {
                            events,
                            batchSize = batch.Count,
                            collectedAt = DateTime.UtcNow.ToString("o")
                        };

                        // Queue to offline buffer for resilient delivery
                        if (_offlineBuffer != null)
                        {
                            await _offlineBuffer.QueueAsync(EventTypes.FileEvent, payload, DateTime.UtcNow);
                        }

                        _logger.Debug("Queued batch of {Count} file change events", batch.Count);
                    }
                    catch (Exception ex)
                    {
                        _logger.Error(ex, "Failed to queue file change events");
                    }
                });

                _logger.Information("File system watcher started successfully - monitoring {Count} paths",
                    _fileSystemWatcher.GetMonitoredPaths().Count);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to start file system watcher");
            }
        }

        // Start USB event monitor
        if (_usbEventMonitor != null)
        {
            try
            {
                _usbEventMonitor.StartMonitoring(async (usbEvent) =>
                {
                    try
                    {
                        // Queue USB event to offline buffer
                        var payload = new
                        {
                            eventType = usbEvent.EventType,
                            deviceName = usbEvent.DeviceInfo.Name,
                            deviceId = usbEvent.DeviceInfo.DeviceId,
                            description = usbEvent.DeviceInfo.Description,
                            manufacturer = usbEvent.DeviceInfo.Manufacturer,
                            vendorId = usbEvent.DeviceInfo.VendorId,
                            productId = usbEvent.DeviceInfo.ProductId,
                            serialNumber = usbEvent.DeviceInfo.SerialNumber,
                            deviceType = usbEvent.DeviceInfo.DeviceType,
                            status = usbEvent.DeviceInfo.Status,
                            detectedAt = usbEvent.DetectedAt.ToString("o")
                        };

                        // Queue to offline buffer for resilient delivery
                        if (_offlineBuffer != null)
                        {
                            await _offlineBuffer.QueueAsync(EventTypes.UsbEvent, payload, usbEvent.DetectedAt);
                        }

                        _logger.Debug("Queued USB {EventType} event: {DeviceName}", 
                            usbEvent.EventType, usbEvent.DeviceInfo.Name);
                    }
                    catch (Exception ex)
                    {
                        _logger.Error(ex, "Failed to queue USB event");
                    }
                });

                var connectedCount = _usbEventMonitor.GetCurrentUsbDevices().Count;
                _logger.Information("USB event monitor started successfully - {Count} devices currently connected", 
                    connectedCount);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to start USB event monitor");
            }
        }

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                if (_config.IsEnrolled && !string.IsNullOrEmpty(_config.DeviceKey))
                {
                    await SampleAndSubmitActivityAsync(cancellationToken);
                    
                    // Collect browser history every hour
                    if (_browserHistoryCollector != null)
                    {
                        var hoursSinceLastCollection = (DateTime.UtcNow - _lastBrowserHistoryCollection).TotalHours;
                        
                        if (hoursSinceLastCollection >= 1.0)
                        {
                            try
                            {
                                _logger.Information("Collecting browser history (hourly)");
                                _browserHistoryCollector.CollectAll();
                                _lastBrowserHistoryCollection = DateTime.UtcNow;
                            }
                            catch (Exception ex)
                            {
                                _logger.Error(ex, "Failed to collect browser history");
                            }
                        }
                    }

                    // Scan Wi-Fi networks every 5 minutes
                    if (_wifiScanner != null)
                    {
                        var minutesSinceLastScan = (DateTime.UtcNow - _lastWifiScan).TotalMinutes;
                        
                        if (minutesSinceLastScan >= 5.0)
                        {
                            try
                            {
                                _logger.Information("Scanning Wi-Fi networks (every 5 minutes)");
                                var networks = _wifiScanner.ScanNetworks();
                                
                                if (networks.Count > 0)
                                {
                                    var payload = new
                                    {
                                        networks = networks.Select(n => new
                                        {
                                            ssid = n.Ssid,
                                            bssid = n.Bssid,
                                            signalQuality = n.SignalQuality,
                                            rssi = n.Rssi,
                                            channel = n.Channel,
                                            frequency = n.Frequency,
                                            securityType = n.SecurityType,
                                            isConnected = n.IsConnected,
                                            networkType = n.NetworkType,
                                            detectedAt = n.DetectedAt.ToString("o")
                                        }).ToList(),
                                        networkCount = networks.Count,
                                        scannedAt = DateTime.UtcNow.ToString("o")
                                    };

                                    // Queue to offline buffer
                                    if (_offlineBuffer != null)
                                    {
                                        await _offlineBuffer.QueueAsync(EventTypes.WifiScan, payload, DateTime.UtcNow);
                                    }

                                    _logger.Information("Wi-Fi scan completed: {Count} networks discovered", networks.Count);
                                }

                                _lastWifiScan = DateTime.UtcNow;
                            }
                            catch (Exception ex)
                            {
                                _logger.Error(ex, "Failed to scan Wi-Fi networks");
                            }
                        }
                    }

                    // Scan Bluetooth devices every 5 minutes
                    if (_bluetoothScanner != null)
                    {
                        var minutesSinceLastScan = (DateTime.UtcNow - _lastBluetoothScan).TotalMinutes;
                        
                        if (minutesSinceLastScan >= 5.0)
                        {
                            try
                            {
                                _logger.Information("Scanning Bluetooth devices (every 5 minutes)");
                                var devices = await _bluetoothScanner.ScanDevicesAsync(scanDurationSeconds: 10);
                                
                                if (devices.Count > 0)
                                {
                                    var payload = new
                                    {
                                        devices = devices.Select(d => new
                                        {
                                            name = d.Name,
                                            address = d.Address,
                                            deviceId = d.DeviceId,
                                            deviceType = d.DeviceType,
                                            classOfDevice = d.ClassOfDevice,
                                            isPaired = d.IsPaired,
                                            isConnected = d.IsConnected,
                                            rssi = d.Rssi,
                                            lastSeen = d.LastSeen.ToString("o"),
                                            detectedAt = d.DetectedAt.ToString("o")
                                        }).ToList(),
                                        deviceCount = devices.Count,
                                        scannedAt = DateTime.UtcNow.ToString("o")
                                    };

                                    // Queue to offline buffer
                                    if (_offlineBuffer != null)
                                    {
                                        await _offlineBuffer.QueueAsync(EventTypes.BluetoothScan, payload, DateTime.UtcNow);
                                    }

                                    _logger.Information("Bluetooth scan completed: {Count} devices discovered", devices.Count);
                                }

                                _lastBluetoothScan = DateTime.UtcNow;
                            }
                            catch (Exception ex)
                            {
                                _logger.Error(ex, "Failed to scan Bluetooth devices");
                            }
                        }
                    }

                    // Check media device activity every 60 seconds
                    if (_mediaDeviceMonitor != null)
                    {
                        var secondsSinceLastCheck = (DateTime.UtcNow - _lastMediaDeviceCheck).TotalSeconds;
                        
                        if (secondsSinceLastCheck >= 60.0)
                        {
                            try
                            {
                                _logger.Debug("Checking media device activity (every 60 seconds)");
                                var currentActivities = _mediaDeviceMonitor.CheckMediaActivity();
                                
                                // Detect changes (new activities or stopped activities)
                                var changes = _mediaDeviceMonitor.DetectChanges(currentActivities);
                                
                                if (changes.Count > 0)
                                {
                                    var payload = new
                                    {
                                        activities = changes.Select(a => new
                                        {
                                            deviceType = a.DeviceType,
                                            processId = a.ProcessId,
                                            processName = a.ProcessName,
                                            processPath = a.ProcessPath,
                                            appPackageName = a.AppPackageName,
                                            isActive = a.IsActive,
                                            detectedAt = a.DetectedAt.ToString("o"),
                                            activeSince = a.ActiveSince?.ToString("o"),
                                            stoppedAt = a.StoppedAt?.ToString("o")
                                        }).ToList(),
                                        changeCount = changes.Count,
                                        checkedAt = DateTime.UtcNow.ToString("o")
                                    };

                                    // Queue to offline buffer
                                    if (_offlineBuffer != null)
                                    {
                                        await _offlineBuffer.QueueAsync(EventTypes.MediaActivity, payload, DateTime.UtcNow);
                                    }

                                    _logger.Information("Media device activity changes detected: {Count} ({Mic} microphone, {Cam} camera)",
                                        changes.Count,
                                        changes.Count(a => a.DeviceType == "Microphone"),
                                        changes.Count(a => a.DeviceType == "Camera"));
                                }

                                _lastMediaDeviceCheck = DateTime.UtcNow;
                            }
                            catch (Exception ex)
                            {
                                _logger.Error(ex, "Failed to check media device activity");
                            }
                        }
                    }

                    // Collect security events every 5 minutes
                    if (_securityEventCollector != null)
                    {
                        var minutesSinceLastCollection = (DateTime.UtcNow - _lastSecurityEventCollection).TotalMinutes;
                        
                        if (minutesSinceLastCollection >= 5.0)
                        {
                            try
                            {
                                _logger.Information("Collecting Windows Security Event Log events (every 5 minutes)");
                                var securityEvents = _securityEventCollector.CollectEvents();
                                
                                if (securityEvents.Count > 0)
                                {
                                    var payload = new
                                    {
                                        events = securityEvents,
                                        eventCount = securityEvents.Count,
                                        collectedAt = DateTime.UtcNow.ToString("o")
                                    };

                                    // Queue to offline buffer
                                    if (_offlineBuffer != null)
                                    {
                                        await _offlineBuffer.QueueAsync(EventTypes.SecurityEvent, payload, DateTime.UtcNow);
                                    }

                                    _logger.Information("Security event collection completed: {Count} events collected", securityEvents.Count);
                                }
                                else
                                {
                                    _logger.Debug("No new security events to collect");
                                }

                                _lastSecurityEventCollection = DateTime.UtcNow;
                            }
                            catch (Exception ex)
                            {
                                _logger.Error(ex, "Failed to collect security events");
                            }
                        }
                    }
                }

                // Sample every 60 seconds to maintain lightweight footprint
                await Task.Delay(TimeSpan.FromSeconds(60), cancellationToken);
            }
            catch (TaskCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Activity tracking error");
                await Task.Delay(TimeSpan.FromSeconds(30), cancellationToken);
            }
        }
        
        // Stop clipboard monitor when cancellation requested
        if (_clipboardMonitor != null)
        {
            try
            {
                _clipboardMonitor.Stop();
                _logger.Information("Clipboard monitor stopped");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error stopping clipboard monitor");
            }
        }

        // Stop print spooler monitor
        if (_printSpoolerMonitor != null)
        {
            try
            {
                _printSpoolerMonitor.StopMonitoring();
                _logger.Information("Print spooler monitor stopped");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error stopping print spooler monitor");
            }
        }

        // Stop file system watcher
        if (_fileSystemWatcher != null)
        {
            try
            {
                _fileSystemWatcher.StopMonitoring();
                _logger.Information("File system watcher stopped");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error stopping file system watcher");
            }
        }

        // Stop USB event monitor
        if (_usbEventMonitor != null)
        {
            try
            {
                _usbEventMonitor.StopMonitoring();
                _logger.Information("USB event monitor stopped");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error stopping USB event monitor");
            }
        }
    }

    private async Task SampleAndSubmitActivityAsync(CancellationToken cancellationToken)
    {
        try
        {
            var (processName, windowTitle) = GetActiveWindowInfo();
            var idleSeconds = GetIdleSeconds();

            // If idle for more than 5 minutes (300s), classify as IDLE
            var isIdle = idleSeconds > 300;
            var activeDuration = isIdle ? 0 : 60;
            var idleDuration = isIdle ? 60 : 0;
            var activityState = isIdle ? "IDLE" : "ACTIVE";
            var timestamp = DateTime.UtcNow;

            var payload = new
            {
                events = new[]
                {
                    new
                    {
                        activeWindowProcess = processName,
                        activeWindowTitle = windowTitle,
                        activeDurationSeconds = activeDuration,
                        idleDurationSeconds = idleDuration,
                        activityState,
                        timestamp = timestamp.ToString("o"),
                        metadata = new
                        {
                            idleSecondsMeasured = idleSeconds
                        }
                    }
                }
            };

            var response = await _client.PostAsync<object>("/usage/submit", payload, cancellationToken);
            
            // If send failed, queue for offline storage
            if (!response.IsSuccess && _offlineBuffer != null)
            {
                _logger.Debug("Activity submission failed, queueing for offline sync");
                await _offlineBuffer.QueueAsync(EventTypes.Activity, payload, timestamp);
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.Warning(ex, "Activity network error - queueing for offline sync");
            
            // Network error - queue the event
            if (_offlineBuffer != null)
            {
                var (processName, windowTitle) = GetActiveWindowInfo();
                var idleSeconds = GetIdleSeconds();
                var isIdle = idleSeconds > 300;
                var timestamp = DateTime.UtcNow;
                
                var payload = new
                {
                    events = new[]
                    {
                        new
                        {
                            activeWindowProcess = processName,
                            activeWindowTitle = windowTitle,
                            activeDurationSeconds = isIdle ? 0 : 60,
                            idleDurationSeconds = isIdle ? 60 : 0,
                            activityState = isIdle ? "IDLE" : "ACTIVE",
                            timestamp = timestamp.ToString("o"),
                            metadata = new { idleSecondsMeasured = idleSeconds }
                        }
                    }
                };
                
                await _offlineBuffer.QueueAsync(EventTypes.Activity, payload, timestamp);
            }
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Failed to submit activity sample");
        }
    }

    private (string processName, string windowTitle) GetActiveWindowInfo()
    {
        try
        {
            var hWnd = GetForegroundWindow();
            if (hWnd == IntPtr.Zero)
            {
                return ("idle.exe", "Idle Screen");
            }

            var titleBuilder = new StringBuilder(256);
            GetWindowText(hWnd, titleBuilder, 256);
            var title = titleBuilder.ToString();

            GetWindowThreadProcessId(hWnd, out var processId);
            if (processId > 0)
            {
                using var proc = Process.GetProcessById((int)processId);
                return (proc.ProcessName + ".exe", string.IsNullOrWhiteSpace(title) ? proc.ProcessName : title);
            }
        }
        catch
        {
            // Fallback for system windows or protected processes
        }

        return ("system.exe", "Desktop");
    }

    private int GetIdleSeconds()
    {
        try
        {
            var lastInput = new LASTINPUTINFO { cbSize = LASTINPUTINFO.SizeOf };
            if (GetLastInputInfo(ref lastInput))
            {
                var envTicks = (uint)Environment.TickCount;
                var idleMillis = envTicks - lastInput.dwTime;
                return (int)(idleMillis / 1000);
            }
        }
        catch
        {
            // Ignore
        }
        return 0;
    }
    
    public void Dispose()
    {
        _clipboardMonitor?.Dispose();
        _printSpoolerMonitor?.Dispose();
        _fileSystemWatcher?.Dispose();
        _usbEventMonitor?.Dispose();
        _wifiScanner?.Dispose();
        _bluetoothScanner?.Dispose();
        _mediaDeviceMonitor?.Dispose();
        _securityEventCollector?.Dispose();
    }
}
