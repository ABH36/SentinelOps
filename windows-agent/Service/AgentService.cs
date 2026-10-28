using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Serilog;
using SentinelOpsAgent.Config;
using SentinelOpsAgent.Enrollment;
using SentinelOpsAgent.Inventory;
using SentinelOpsAgent.Heartbeat;
using SentinelOpsAgent.Activity;
using SentinelOpsAgent.Commands;
using SentinelOpsAgent.Security;
using SentinelOpsAgent.Storage;
using System.Net.Http.Json;

namespace SentinelOpsAgent.Service;

public class AgentService : BackgroundService
{
    private readonly ILogger _logger;
    private readonly AgentConfig _config;
    private readonly EnrollmentManager _enrollmentManager;
    private readonly InventoryCollector _inventoryCollector;
    private readonly HeartbeatManager _heartbeatManager;
    private readonly ActivityTracker _activityTracker;
    private readonly CommandExecutor _commandExecutor;
    private readonly WebSocketCommandListener _webSocketListener;
    private readonly OfflineBuffer? _offlineBuffer;

    public AgentService(
        ILogger logger,
        IOptions<AgentConfig> config,
        EnrollmentManager enrollmentManager,
        InventoryCollector inventoryCollector,
        HeartbeatManager heartbeatManager,
        ActivityTracker activityTracker,
        CommandExecutor commandExecutor,
        WebSocketCommandListener webSocketListener,
        OfflineBuffer? offlineBuffer = null)
    {
        _logger = logger;
        _config = config.Value;
        _enrollmentManager = enrollmentManager;
        _inventoryCollector = inventoryCollector;
        _heartbeatManager = heartbeatManager;
        _activityTracker = activityTracker;
        _commandExecutor = commandExecutor;
        _webSocketListener = webSocketListener;
        _offlineBuffer = offlineBuffer;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.Information("SentinelOps Agent starting...");

        try
        {
            // Apply registry hardening on first startup
            try
            {
                _logger.Information("Applying registry hardening...");
                RegistryHardening.HardenRegistryKeys();
                _logger.Information("✅ Registry hardening applied successfully");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to apply registry hardening (non-fatal)");
            }

            // Start periodic anti-tamper checks
            _ = Task.Run(() => PeriodicAntiTamperChecksAsync(stoppingToken), stoppingToken);

            // Start periodic offline queue flush
            if (_offlineBuffer != null)
            {
                _ = Task.Run(() => PeriodicOfflineFlushAsync(stoppingToken), stoppingToken);
            }

            // Check if device is enrolled
            if (!_config.IsEnrolled || string.IsNullOrEmpty(_config.DeviceKey))
            {
                _logger.Warning("Device not enrolled. Waiting for enrollment...");
                // In production, this would prompt for enrollment token
                // For now, we'll wait and retry
                await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
            }
            else
            {
                _logger.Information("Device enrolled with ID: {DeviceId}", _config.DeviceId);

                // Start all services:
                // - Heartbeat (health telemetry)
                // - Inventory (installed apps/system info)
                // - Activity tracker (user activity monitoring)
                // - WebSocket command listener (real-time commands)
                // - HTTP polling command listener (fallback)
                
                var heartbeatTask = _heartbeatManager.StartAsync(stoppingToken);
                var inventoryTask = _inventoryCollector.StartAsync(stoppingToken);
                var activityTask = _activityTracker.StartAsync(stoppingToken);
                
                // Start WebSocket listener (primary)
                var webSocketTask = _webSocketListener.StartAsync(stoppingToken);
                
                // Start HTTP polling as fallback (only active when WebSocket disconnected)
                var httpFallbackTask = StartHttpFallbackAsync(stoppingToken);

                await Task.WhenAll(heartbeatTask, inventoryTask, activityTask, webSocketTask, httpFallbackTask);
            }
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Agent service error");
            throw;
        }
    }

    /// <summary>
    /// HTTP polling fallback: only polls when WebSocket is not connected
    /// </summary>
    private async Task StartHttpFallbackAsync(CancellationToken cancellationToken)
    {
        _logger.Information("HTTP polling fallback listener starting...");

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                // Only poll if WebSocket is NOT connected
                if (!_webSocketListener.IsConnected)
                {
                    if (_config.IsEnrolled && !string.IsNullOrEmpty(_config.DeviceKey))
                    {
                        _logger.Debug("WebSocket disconnected, using HTTP polling fallback");
                        await _commandExecutor.StartAsync(cancellationToken);
                    }
                }

                // Check every 30 seconds
                await Task.Delay(TimeSpan.FromSeconds(30), cancellationToken);
            }
            catch (TaskCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "HTTP fallback error");
                await Task.Delay(TimeSpan.FromSeconds(15), cancellationToken);
            }
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.Information("SentinelOps Agent stopping...");
        await base.StopAsync(cancellationToken);
    }

    /// <summary>
    /// Periodic anti-tamper checks: runs every 5 minutes to detect debuggers
    /// </summary>
    private async Task PeriodicAntiTamperChecksAsync(CancellationToken cancellationToken)
    {
        _logger.Information("Periodic anti-tamper checks starting (interval: 5 minutes)");

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromMinutes(5), cancellationToken);

                // Check for debugger
                if (AntiTamperUtilities.IsDebuggerAttached())
                {
                    _logger.Warning("🚨 SECURITY: Debugger detected during periodic check. Reporting tamper event.");

                    // Report to backend
                    await ReportTamperEventAsync("DEBUGGER_DETECTED_RUNTIME", 
                        "Debugger was detected attached to agent process during periodic security check");

                    // Optional: Exit immediately to prevent further debugging
                    // Environment.Exit(1);
                }

                // Check if running under expected parent process
                var parentProcess = AntiTamperUtilities.GetParentProcessName();
                if (!string.IsNullOrEmpty(parentProcess) && 
                    parentProcess.ToLower() != "services" &&
                    parentProcess.ToLower() != "services.exe")
                {
                    _logger.Warning("🚨 SECURITY: Agent not running under services.exe (parent: {ParentProcess})", parentProcess);
                    
                    await ReportTamperEventAsync("UNEXPECTED_PARENT_PROCESS",
                        $"Agent is not running under services.exe. Current parent: {parentProcess}");
                }
            }
            catch (TaskCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Error during periodic anti-tamper check");
            }
        }

        _logger.Information("Periodic anti-tamper checks stopped");
    }

    /// <summary>
    /// Periodic offline queue flush: runs every 15 minutes to sync pending events
    /// </summary>
    private async Task PeriodicOfflineFlushAsync(CancellationToken cancellationToken)
    {
        _logger.Information("Periodic offline flush starting (interval: 15 minutes)");

        // Wait 2 minutes before first flush (let agent stabilize)
        await Task.Delay(TimeSpan.FromMinutes(2), cancellationToken);

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                if (_offlineBuffer != null)
                {
                    // Get queue stats
                    var stats = await _offlineBuffer.GetStatsAsync();
                    
                    if (stats.Pending > 0)
                    {
                        _logger.Information("Offline queue has {Pending} pending events, flushing...", stats.Pending);
                        
                        var flushed = await _offlineBuffer.FlushAsync();
                        
                        if (flushed > 0)
                        {
                            _logger.Information("✓ Flushed {Count} offline events", flushed);
                        }
                    }
                    else
                    {
                        _logger.Debug("Offline queue empty, no flush needed");
                    }
                }

                // Wait 15 minutes before next flush
                await Task.Delay(TimeSpan.FromMinutes(15), cancellationToken);
            }
            catch (TaskCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Error during periodic offline flush");
                await Task.Delay(TimeSpan.FromMinutes(5), cancellationToken); // Retry sooner on error
            }
        }

        _logger.Information("Periodic offline flush stopped");
    }

    /// <summary>
    /// Report tamper event to backend via heartbeat endpoint
    /// </summary>
    private async Task ReportTamperEventAsync(string reason, string details)
    {
        try
        {
            if (!_config.IsEnrolled || string.IsNullOrEmpty(_config.DeviceKey))
            {
                _logger.Warning("Device not enrolled, cannot report tamper event");
                return;
            }

            using var httpClient = new HttpClient();
            var endpoint = $"{_config.BackendUrl.TrimEnd('/')}/api/heartbeat/tamper";
            
            var tamperEvent = new
            {
                reason,
                details,
                timestamp = DateTime.UtcNow,
                hostname = Environment.MachineName,
                username = Environment.UserName,
                processId = Environment.ProcessId,
                parentProcess = AntiTamperUtilities.GetParentProcessName(),
            };

            var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
            request.Headers.Add("X-Device-Key", _config.DeviceKey);
            request.Headers.Add("X-Device-Secret", _config.DeviceSecret);
            request.Content = JsonContent.Create(tamperEvent);

            var response = await httpClient.SendAsync(request);
            
            if (response.IsSuccessStatusCode)
            {
                _logger.Information("Tamper event reported to backend: {Reason}", reason);
            }
            else
            {
                _logger.Warning("Failed to report tamper event: HTTP {StatusCode}", response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Error reporting tamper event");
        }
    }
}
