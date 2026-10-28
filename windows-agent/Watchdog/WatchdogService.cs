using System.Diagnostics;
using System.Net.Http.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;

namespace SentinelWatchdog;

/// <summary>
/// Anti-tamper watchdog service that monitors the main SentinelOps agent process.
/// Automatically restarts the agent if it's killed or crashes, and reports tamper events to backend.
/// 
/// Security Features:
/// - Runs as separate Windows service for resilience
/// - Disguised service name: "WUAgentHelper" (Windows Update Agent Helper)
/// - Monitors process by disguised name to avoid detection
/// - Reports tamper events to backend for audit trail
/// - Automatic restart with exponential backoff on repeated failures
/// - SYSTEM-only log path to prevent tampering
/// 
/// Deployment:
/// - Install as Windows service with SYSTEM privileges
/// - Configure auto-start on boot
/// - Set recovery options to restart on failure
/// </summary>
public class WatchdogService : BackgroundService
{
    private readonly ILogger<WatchdogService> _logger;
    private readonly IConfiguration _configuration;
    private readonly HttpClient _httpClient;
    
    // Configuration values
    private readonly string _agentProcessName;
    private readonly string _agentExecutablePath;
    private readonly string _deviceKey;
    private readonly string _deviceSecret;
    private readonly string _backendUrl;
    private readonly int _checkIntervalSeconds;
    private readonly int _restartVerifyDelaySeconds;
    
    // State tracking
    private int _consecutiveRestarts = 0;
    private DateTime _lastRestartTime = DateTime.MinValue;
    private const int MAX_CONSECUTIVE_RESTARTS = 5;
    private const int BACKOFF_RESET_MINUTES = 15;

    public WatchdogService(
        ILogger<WatchdogService> logger,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory)
    {
        _logger = logger;
        _configuration = configuration;
        _httpClient = httpClientFactory.CreateClient();

        // Load configuration with secure defaults
        _agentProcessName = configuration["Watchdog:AgentProcessName"] ?? "WUAgentHelper";
        _agentExecutablePath = configuration["Watchdog:AgentExecutablePath"] 
            ?? Path.Combine(AppContext.BaseDirectory, "..", "SentinelOpsAgent.exe");
        _deviceKey = configuration["Watchdog:DeviceKey"] ?? Environment.GetEnvironmentVariable("SENTINEL_DEVICE_KEY") ?? "";
        _deviceSecret = configuration["Watchdog:DeviceSecret"] ?? Environment.GetEnvironmentVariable("SENTINEL_DEVICE_SECRET") ?? "";
        _backendUrl = configuration["Watchdog:BackendUrl"] ?? "https://api.sentinelops.com";
        _checkIntervalSeconds = int.Parse(configuration["Watchdog:CheckIntervalSeconds"] ?? "3");
        _restartVerifyDelaySeconds = int.Parse(configuration["Watchdog:RestartVerifyDelaySeconds"] ?? "10");

        _logger.LogInformation("🛡️ SentinelOps Watchdog initialized");
        _logger.LogInformation("Monitoring process: {ProcessName}", _agentProcessName);
        _logger.LogInformation("Executable path: {ExecutablePath}", _agentExecutablePath);
        _logger.LogInformation("Check interval: {Interval} seconds", _checkIntervalSeconds);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Watchdog service started. Monitoring agent process...");

        // Initial delay to ensure agent has time to start
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Check if main agent process is running
                bool isRunning = IsProcessRunning(_agentProcessName);

                if (!isRunning)
                {
                    _logger.LogWarning("⚠️ Agent process '{ProcessName}' is NOT running!", _agentProcessName);
                    await HandleAgentDownAsync(stoppingToken);
                }
                else
                {
                    _logger.LogDebug("✓ Agent process '{ProcessName}' is running (PID: {Pid})", 
                        _agentProcessName, 
                        GetProcessId(_agentProcessName));
                    
                    // Reset consecutive restart counter if enough time has passed
                    if (_consecutiveRestarts > 0 && 
                        DateTime.Now - _lastRestartTime > TimeSpan.FromMinutes(BACKOFF_RESET_MINUTES))
                    {
                        _logger.LogInformation("Resetting consecutive restart counter (agent stable for {Minutes} minutes)", 
                            BACKOFF_RESET_MINUTES);
                        _consecutiveRestarts = 0;
                    }
                }

                // Wait before next check
                await Task.Delay(TimeSpan.FromSeconds(_checkIntervalSeconds), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                // Service is stopping, exit gracefully
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in watchdog monitoring loop: {Message}", ex.Message);
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }

        _logger.LogInformation("Watchdog service stopped");
    }

    /// <summary>
    /// Check if a process with the given name is currently running.
    /// </summary>
    private bool IsProcessRunning(string processName)
    {
        try
        {
            // Remove .exe extension if provided
            processName = processName.Replace(".exe", "", StringComparison.OrdinalIgnoreCase);
            
            var processes = Process.GetProcessesByName(processName);
            return processes.Length > 0;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking if process '{ProcessName}' is running", processName);
            return false;
        }
    }

    /// <summary>
    /// Get the process ID of the agent process.
    /// </summary>
    private int GetProcessId(string processName)
    {
        try
        {
            processName = processName.Replace(".exe", "", StringComparison.OrdinalIgnoreCase);
            var processes = Process.GetProcessesByName(processName);
            return processes.Length > 0 ? processes[0].Id : -1;
        }
        catch
        {
            return -1;
        }
    }

    /// <summary>
    /// Handle scenario where main agent process is down.
    /// Attempts to restart and reports tamper event to backend.
    /// </summary>
    private async Task HandleAgentDownAsync(CancellationToken stoppingToken)
    {
        _consecutiveRestarts++;
        _lastRestartTime = DateTime.Now;

        // Check if we've exceeded max consecutive restarts
        if (_consecutiveRestarts > MAX_CONSECUTIVE_RESTARTS)
        {
            _logger.LogCritical(
                "🚨 CRITICAL: Agent has failed {Count} consecutive restart attempts. " +
                "Possible system compromise or persistent failure. Manual intervention required.",
                _consecutiveRestarts);
            
            // Report critical tamper event
            await ReportTamperEventAsync(
                "REPEATED_RESTART_FAILURE", 
                $"Agent failed to restart {_consecutiveRestarts} consecutive times", 
                stoppingToken);
            
            // Exponential backoff before next restart attempt
            int backoffSeconds = Math.Min(300, (int)Math.Pow(2, _consecutiveRestarts - MAX_CONSECUTIVE_RESTARTS) * 30);
            _logger.LogWarning("Waiting {Seconds} seconds before next restart attempt (exponential backoff)", backoffSeconds);
            await Task.Delay(TimeSpan.FromSeconds(backoffSeconds), stoppingToken);
        }

        // Report tamper event to backend
        await ReportTamperEventAsync("AGENT_KILLED", "Main agent process terminated unexpectedly", stoppingToken);

        // Attempt to restart the agent
        bool restartSuccess = await RestartAgentAsync(stoppingToken);

        if (restartSuccess)
        {
            _logger.LogInformation("✅ Agent successfully restarted");
            
            // Wait and verify restart succeeded
            await Task.Delay(TimeSpan.FromSeconds(_restartVerifyDelaySeconds), stoppingToken);
            
            bool isRunning = IsProcessRunning(_agentProcessName);
            if (isRunning)
            {
                _logger.LogInformation("✓ Verified: Agent is running after restart (PID: {Pid})", 
                    GetProcessId(_agentProcessName));
            }
            else
            {
                _logger.LogError("❌ Agent restart verification failed: Process not running after {Seconds} seconds", 
                    _restartVerifyDelaySeconds);
                await ReportTamperEventAsync("AGENT_RESTART_FAILED", "Agent failed to start after restart attempt", stoppingToken);
            }
        }
        else
        {
            _logger.LogError("❌ Failed to restart agent process");
            await ReportTamperEventAsync("AGENT_RESTART_FAILED", "Failed to execute agent restart", stoppingToken);
        }
    }

    /// <summary>
    /// Restart the main agent process.
    /// </summary>
    private async Task<bool> RestartAgentAsync(CancellationToken stoppingToken)
    {
        try
        {
            // Validate executable path exists
            if (!File.Exists(_agentExecutablePath))
            {
                _logger.LogError("Agent executable not found at: {Path}", _agentExecutablePath);
                return false;
            }

            _logger.LogInformation("🔄 Attempting to restart agent: {Path}", _agentExecutablePath);

            // Start the agent process
            var processStartInfo = new ProcessStartInfo
            {
                FileName = _agentExecutablePath,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = false,
                RedirectStandardError = false,
                WorkingDirectory = Path.GetDirectoryName(_agentExecutablePath) ?? AppContext.BaseDirectory,
            };

            using var process = Process.Start(processStartInfo);

            if (process == null)
            {
                _logger.LogError("Failed to start process: Process.Start returned null");
                return false;
            }

            _logger.LogInformation("Agent process started with PID: {Pid}", process.Id);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error restarting agent: {Message}", ex.Message);
            return false;
        }
    }

    /// <summary>
    /// Report tamper event to backend for audit trail and alerting.
    /// </summary>
    private async Task ReportTamperEventAsync(string reason, string details, CancellationToken stoppingToken)
    {
        try
        {
            // Skip if device credentials not configured
            if (string.IsNullOrEmpty(_deviceKey) || string.IsNullOrEmpty(_deviceSecret))
            {
                _logger.LogWarning("Device credentials not configured. Skipping tamper event report.");
                return;
            }

            var tamperEvent = new
            {
                reason = reason,
                details = details,
                timestamp = DateTime.UtcNow,
                processName = _agentProcessName,
                executablePath = _agentExecutablePath,
                consecutiveRestarts = _consecutiveRestarts,
                hostname = Environment.MachineName,
                username = Environment.UserName,
            };

            _logger.LogInformation("📡 Reporting tamper event to backend: {Reason}", reason);

            var endpoint = $"{_backendUrl.TrimEnd('/')}/api/telemetry/tamper";
            
            var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
            request.Headers.Add("X-Device-Key", _deviceKey);
            request.Headers.Add("X-Device-Secret", _deviceSecret);
            request.Content = JsonContent.Create(tamperEvent);

            var response = await _httpClient.SendAsync(request, stoppingToken);

            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("✅ Tamper event reported successfully");
            }
            else
            {
                _logger.LogWarning("⚠️ Failed to report tamper event: HTTP {StatusCode}", response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reporting tamper event: {Message}", ex.Message);
            // Don't throw - tamper reporting is non-critical for watchdog operation
        }
    }

    public override async Task StopAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Watchdog service stopping...");
        await base.StopAsync(stoppingToken);
    }
}
