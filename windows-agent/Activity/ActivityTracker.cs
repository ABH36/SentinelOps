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

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                if (_config.IsEnrolled && !string.IsNullOrEmpty(_config.DeviceKey))
                {
                    await SampleAndSubmitActivityAsync(cancellationToken);
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
    }
}
