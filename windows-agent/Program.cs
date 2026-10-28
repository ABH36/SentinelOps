using SentinelOpsAgent.Activity;
using SentinelOpsAgent.Commands;
using SentinelOpsAgent.Security;
using SentinelOpsAgent.Storage;
using System.Net.Http.Json;
using System.IO;

// Anti-tamper check on startup
if (AntiTamperUtilities.IsDebuggerAttached())
{
    Log.Warning("🚨 SECURITY: Debugger detected on agent startup. Reporting tamper event and exiting.");
    
    // Report tamper event to backend
    try
    {
        await ReportDebuggerDetectionAsync();
    }
    catch (Exception ex)
    {
        Log.Error(ex, "Failed to report debugger detection");
    }
    
    // Exit immediately to prevent debugging
    Environment.Exit(1);
    return;
}

// Log security context
Log.Information("Security context: Admin={IsAdmin}, System={IsSystem}, Parent={ParentProcess}",
    AntiTamperUtilities.IsRunningAsAdmin(),
    AntiTamperUtilities.IsRunningAsSystem(),
    AntiTamperUtilities.GetParentProcessName());

IHost host = Host.CreateDefaultBuilder(args)
    .UseWindowsService()
    .UseSerilog((context, services, configuration) => configuration
        .ReadFrom.Configuration(context.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext()
        .WriteTo.File("logs/sentinelops-.log", rollingInterval: RollingInterval.Day)
        .WriteTo.EventLog("SentinelOps Agent", manageEventSource: true))
    .ConfigureServices((hostContext, services) =>
    {
        // Configure offline buffer
        services.AddSingleton<OfflineBuffer>(sp =>
        {
            var config = hostContext.Configuration.GetSection("Agent").Get<AgentConfig>();
            var logger = sp.GetRequiredService<ILogger>();
            
            // Determine data directory (hidden GUID path in production)
            var dataDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "Microsoft", "Windows", "DeviceCache", 
                config?.DeviceId ?? Guid.NewGuid().ToString());
            
            return new OfflineBuffer(
                dataDirectory,
                config?.BackendUrl ?? "https://api.sentinelops.com",
                config?.DeviceKey ?? "",
                config?.DeviceSecret ?? "",
                logger);
        });
        
        services.AddHostedService<AgentService>();
        services.AddSingleton<EnrollmentManager>();
        services.AddSingleton<InventoryCollector>();
        services.AddSingleton<HeartbeatManager>();
        services.AddSingleton<ActivityTracker>();
        services.AddSingleton<CommandExecutor>();
        services.AddSingleton<WebSocketCommandListener>();
        services.AddSingleton<CommunicationClient>();
        services.Configure<AgentConfig>(hostContext.Configuration.GetSection("Agent"));
    })
    .Build();

await host.RunAsync();

// Helper method to report debugger detection
static async Task ReportDebuggerDetectionAsync()
{
    try
    {
        var config = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        var deviceKey = config["Agent:DeviceKey"] ?? Environment.GetEnvironmentVariable("SENTINEL_DEVICE_KEY");
        var deviceSecret = config["Agent:DeviceSecret"] ?? Environment.GetEnvironmentVariable("SENTINEL_DEVICE_SECRET");
        var backendUrl = config["Agent:BackendUrl"] ?? "https://api.sentinelops.com";

        if (string.IsNullOrEmpty(deviceKey) || string.IsNullOrEmpty(deviceSecret))
        {
            Log.Warning("Device credentials not configured, cannot report debugger detection");
            return;
        }

        using var httpClient = new HttpClient();
        var endpoint = $"{backendUrl.TrimEnd('/')}/api/telemetry/tamper";
        
        var tamperEvent = new
        {
            reason = "DEBUGGER_DETECTED",
            details = "Debugger was detected attached to agent process on startup",
            timestamp = DateTime.UtcNow,
            hostname = Environment.MachineName,
            username = Environment.UserName,
            processId = Environment.ProcessId,
            parentProcess = AntiTamperUtilities.GetParentProcessName(),
        };

        var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
        request.Headers.Add("X-Device-Key", deviceKey);
        request.Headers.Add("X-Device-Secret", deviceSecret);
        request.Content = JsonContent.Create(tamperEvent);

        var response = await httpClient.SendAsync(request);
        
        if (response.IsSuccessStatusCode)
        {
            Log.Information("Debugger detection reported to backend");
        }
        else
        {
            Log.Warning("Failed to report debugger detection: HTTP {StatusCode}", response.StatusCode);
        }
    }
    catch (Exception ex)
    {
        Log.Error(ex, "Error reporting debugger detection");
    }
}
