using Microsoft.Extensions.Options;
using Serilog;
using SentinelOpsAgent.Config;
using SentinelOpsAgent.Security;
using SentinelOpsAgent.Storage;
using System.Diagnostics;

namespace SentinelOpsAgent.Heartbeat;

public class HeartbeatManager
{
    private readonly ILogger _logger;
    private readonly AgentConfig _config;
    private readonly CommunicationClient _client;
    private readonly OfflineBuffer? _offlineBuffer;
    private bool _wasOffline = false;

    public HeartbeatManager(
        ILogger logger,
        IOptions<AgentConfig> config,
        CommunicationClient client,
        OfflineBuffer? offlineBuffer = null)
    {
        _logger = logger;
        _config = config.Value;
        _client = client;
        _offlineBuffer = offlineBuffer;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.Information("Starting heartbeat manager...");

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await SendHeartbeatAsync(cancellationToken);
                await Task.Delay(TimeSpan.FromSeconds(_config.HeartbeatIntervalSeconds), cancellationToken);
            }
            catch (TaskCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Heartbeat error");
                await Task.Delay(TimeSpan.FromMinutes(1), cancellationToken);
            }
        }
    }

    private async Task SendHeartbeatAsync(CancellationToken cancellationToken)
    {
        try
        {
            _logger.Debug("Sending heartbeat...");

            var heartbeat = new
            {
                deviceKey = _config.DeviceKey,
                deviceSecret = _config.DeviceSecret,
                health = GetHealthInfo(),
                connectivity = GetConnectivityInfo(),
                agent = GetAgentStatus(),
                timestamp = DateTime.UtcNow
            };

            var response = await _client.PostAsync<object>("/heartbeat/submit", heartbeat, cancellationToken);

            if (response.IsSuccess)
            {
                _logger.Debug("Heartbeat sent successfully");

                // If we were offline and now back online, flush pending events
                if (_wasOffline && _offlineBuffer != null)
                {
                    _logger.Information("Network reconnected, flushing offline queue...");
                    var flushed = await _offlineBuffer.FlushAsync();
                    
                    if (flushed > 0)
                    {
                        _logger.Information("✓ Flushed {Count} offline events after reconnection", flushed);
                    }
                    
                    _wasOffline = false;
                }
            }
            else
            {
                _logger.Warning("Heartbeat failed: {Error}", response.ErrorMessage);
                
                // Queue for offline storage
                if (_offlineBuffer != null)
                {
                    await _offlineBuffer.QueueAsync(EventTypes.Heartbeat, heartbeat, heartbeat.timestamp);
                    _wasOffline = true;
                }
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.Error(ex, "Heartbeat network error - queueing for offline sync");
            
            // Network error - queue the event
            if (_offlineBuffer != null)
            {
                var heartbeat = new
                {
                    deviceKey = _config.DeviceKey,
                    deviceSecret = _config.DeviceSecret,
                    health = GetHealthInfo(),
                    connectivity = GetConnectivityInfo(),
                    agent = GetAgentStatus(),
                    timestamp = DateTime.UtcNow
                };
                
                await _offlineBuffer.QueueAsync(EventTypes.Heartbeat, heartbeat, heartbeat.timestamp);
                _wasOffline = true;
            }
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Heartbeat error");
        }
    }

    private object GetHealthInfo()
    {
        try
        {
            var cpuCounter = new PerformanceCounter("Processor", "% Processor Time", "_Total");
            cpuCounter.NextValue();
            Thread.Sleep(500);
            var cpuUsage = cpuCounter.NextValue();

            var memCounter = new PerformanceCounter("Memory", "Available MBytes");
            var availableMemory = memCounter.NextValue();
            var totalMemory = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes / (1024 * 1024);
            var memoryUsage = ((totalMemory - availableMemory) / totalMemory) * 100;

            return new
            {
                cpuUsage = Math.Round(cpuUsage, 2),
                memoryUsage = Math.Round(memoryUsage, 2),
                diskUsage = 50.0, // Simplified
                batteryLevel = GetBatteryLevel(),
                batteryStatus = GetBatteryStatus(),
                uptime = (int)TimeSpan.FromMilliseconds(Environment.TickCount64).TotalSeconds
            };
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Failed to get health info");
            return new Dictionary<string, object>();
        }
    }

    private object GetConnectivityInfo()
    {
        try
        {
            // Simplified connectivity check
            return new
            {
                isConnected = true,
                connectionType = "Ethernet/WiFi",
                latency = 10.0 // Simplified
            };
        }
        catch
        {
            return new Dictionary<string, object>();
        }
    }

    private object GetAgentStatus()
    {
        return new
        {
            status = "healthy",
            lastCommand = "none",
            pendingCommands = 0,
            errors = Array.Empty<string>()
        };
    }

    private double GetBatteryLevel()
    {
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher("SELECT EstimatedChargeRemaining FROM Win32_Battery");
            foreach (var battery in searcher.Get())
            {
                return Convert.ToDouble(battery["EstimatedChargeRemaining"]);
            }
        }
        catch
        {
            // Desktop systems may not have battery
        }
        return 100.0;
    }

    private string GetBatteryStatus()
    {
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher("SELECT BatteryStatus FROM Win32_Battery");
            foreach (var battery in searcher.Get())
            {
                var status = Convert.ToInt32(battery["BatteryStatus"]);
                return status switch
                {
                    1 => "Discharging",
                    2 => "Charging",
                    _ => "Unknown"
                };
            }
        }
        catch
        {
            // Desktop systems may not have battery
        }
        return "AC Power";
    }
}
