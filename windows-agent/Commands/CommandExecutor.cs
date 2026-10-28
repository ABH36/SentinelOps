using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Microsoft.Win32;
using Microsoft.Toolkit.Uwp.Notifications;
using Serilog;
using SentinelOpsAgent.Config;
using SentinelOpsAgent.Security;
using SentinelOpsAgent.Inventory;
using SentinelAgent.Forensics;

namespace SentinelOpsAgent.Commands;

public class CommandExecutor
{
    private readonly ILogger _logger;
    private readonly AgentConfig _config;
    private readonly CommunicationClient _client;
    private readonly InventoryCollector _inventoryCollector;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool LockWorkStation();

    public CommandExecutor(
        ILogger logger,
        IOptions<AgentConfig> config,
        CommunicationClient client,
        InventoryCollector inventoryCollector)
    {
        _logger = logger;
        _config = config.Value;
        _client = client;
        _inventoryCollector = inventoryCollector;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.Information("Starting remote command listener...");

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                if (_config.IsEnrolled && !string.IsNullOrEmpty(_config.DeviceKey))
                {
                    await PollAndExecuteCommandsAsync(cancellationToken);
                }

                // Poll every 30 seconds for pending commands
                await Task.Delay(TimeSpan.FromSeconds(30), cancellationToken);
            }
            catch (TaskCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Command listener error");
                await Task.Delay(TimeSpan.FromSeconds(15), cancellationToken);
            }
        }
    }

    private async Task PollAndExecuteCommandsAsync(CancellationToken cancellationToken)
    {
        try
        {
            var response = await _client.GetAsync<CommandPollResponse>("/remote-actions/poll", cancellationToken);

            if (response.IsSuccess && response.Data?.commands != null)
            {
                foreach (var command in response.Data.commands)
                {
                    _logger.Information("Received remote command: {ActionType} (ID: {CommandId})", command.actionType, command.id);
                    await ExecuteSingleCommandAsync(command, cancellationToken);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Failed to poll remote commands");
        }
    }

    public async Task ExecuteSingleCommandAsync(CommandItem command, CancellationToken cancellationToken)
    {
        var status = "COMPLETED";
        string? errorMessage = null;
        var resultData = new Dictionary<string, object>();

        try
        {
            switch (command.actionType.ToUpperInvariant())
            {
                case "LOCK":
                    var locked = LockWorkStation();
                    if (!locked)
                    {
                        var errorCode = Marshal.GetLastWin32Error();
                        status = "FAILED";
                        errorMessage = $"LockWorkStation failed with Win32 error code {errorCode}";
                    }
                    else
                    {
                        resultData["lockedAt"] = DateTime.UtcNow.ToString("o");
                    }
                    break;

                case "RESTART":
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "shutdown.exe",
                        Arguments = "/r /t 30 /c \"SentinelOps Enterprise IT Scheduled Restart\"",
                        CreateNoWindow = true,
                        UseShellExecute = false
                    });
                    resultData["restartScheduledInSeconds"] = 30;
                    break;

                case "REFRESH_INVENTORY":
                    _logger.Information("Executing REFRESH_INVENTORY command - triggering full inventory collection");
                    await _inventoryCollector.CollectAndSubmitInventoryAsync(cancellationToken);
                    
                    resultData["refreshedAt"] = DateTime.UtcNow.ToString("o");
                    resultData["machineName"] = Environment.MachineName;
                    resultData["osVersion"] = Environment.OSVersion.VersionString;
                    resultData["triggered"] = "MANUAL_COMMAND";
                    _logger.Information("Inventory refresh completed and submitted to backend");
                    break;

                case "EXECUTE_COMMAND":
                    _logger.Information("Executing EXECUTE_COMMAND - PowerShell execution");
                    
                    // Extract command from payload
                    string? psCommand = null;
                    if (command.payload.HasValue)
                    {
                        if (command.payload.Value.TryGetProperty("command", out var cmdElement))
                        {
                            psCommand = cmdElement.GetString();
                        }
                    }

                    if (string.IsNullOrWhiteSpace(psCommand))
                    {
                        status = "FAILED";
                        errorMessage = "No command provided in payload";
                        break;
                    }

                    var outputLines = new List<string>();
                    var errorLines = new List<string>();
                    int exitCode = -1;

                    try
                    {
                        var psi = new ProcessStartInfo
                        {
                            FileName = "powershell.exe",
                            Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{psCommand.Replace("\"", "\\\"")}\"",
                            UseShellExecute = false,
                            RedirectStandardOutput = true,
                            RedirectStandardError = true,
                            CreateNoWindow = true,
                            WorkingDirectory = Environment.GetFolderPath(Environment.SpecialFolder.System)
                        };

                        using var process = new Process { StartInfo = psi };
                        
                        // Capture output line by line for real-time streaming
                        process.OutputDataReceived += (sender, e) =>
                        {
                            if (!string.IsNullOrEmpty(e.Data))
                            {
                                outputLines.Add(e.Data);
                                _logger.Debug("PS Output: {Line}", e.Data);
                                
                                // Stream to backend in real-time (fire and forget)
                                _ = Task.Run(async () =>
                                {
                                    try
                                    {
                                        await _client.PostAsync<object>("/remote-actions/stream", new
                                        {
                                            commandId = command.id,
                                            type = "stdout",
                                            line = e.Data
                                        }, cancellationToken);
                                    }
                                    catch (Exception ex)
                                    {
                                        _logger.Warning(ex, "Failed to stream output line");
                                    }
                                });
                            }
                        };

                        process.ErrorDataReceived += (sender, e) =>
                        {
                            if (!string.IsNullOrEmpty(e.Data))
                            {
                                errorLines.Add(e.Data);
                                _logger.Warning("PS Error: {Line}", e.Data);
                                
                                // Stream to backend in real-time (fire and forget)
                                _ = Task.Run(async () =>
                                {
                                    try
                                    {
                                        await _client.PostAsync<object>("/remote-actions/stream", new
                                        {
                                            commandId = command.id,
                                            type = "stderr",
                                            line = e.Data
                                        }, cancellationToken);
                                    }
                                    catch (Exception ex)
                                    {
                                        _logger.Warning(ex, "Failed to stream error line");
                                    }
                                });
                            }
                        };

                        process.Start();
                        process.BeginOutputReadLine();
                        process.BeginErrorReadLine();

                        // Wait for completion with timeout (5 minutes max)
                        var completed = process.WaitForExit(300000); // 5 minute timeout
                        
                        if (!completed)
                        {
                            process.Kill(entireProcessTree: true);
                            status = "FAILED";
                            errorMessage = "Command execution timeout (5 minutes)";
                        }
                        else
                        {
                            exitCode = process.ExitCode;
                            
                            if (exitCode != 0)
                            {
                                status = "COMPLETED"; // Still completed, but with non-zero exit
                                _logger.Warning("PowerShell command exited with code {ExitCode}", exitCode);
                            }
                        }

                        resultData["exitCode"] = exitCode;
                        resultData["outputLines"] = outputLines.Count;
                        resultData["errorLines"] = errorLines.Count;
                        resultData["command"] = psCommand;
                        resultData["executedAt"] = DateTime.UtcNow.ToString("o");
                        
                        // Include first 10 lines of output in result (full output was streamed)
                        if (outputLines.Count > 0)
                        {
                            resultData["outputPreview"] = string.Join("\n", outputLines.Take(10));
                        }
                        
                        if (errorLines.Count > 0)
                        {
                            resultData["errorPreview"] = string.Join("\n", errorLines.Take(10));
                        }
                    }
                    catch (Exception psEx)
                    {
                        status = "FAILED";
                        errorMessage = $"PowerShell execution error: {psEx.Message}";
                        _logger.Error(psEx, "PowerShell execution failed");
                    }

                    _logger.Information("PowerShell command completed with exit code {ExitCode}", exitCode);
                    break;

                case "KILL_PROCESS":
                    _logger.Information("Executing KILL_PROCESS command");
                    
                    string? processName = null;
                    int? processPid = null;
                    
                    // Extract processName or pid from payload
                    if (command.payload.HasValue)
                    {
                        if (command.payload.Value.TryGetProperty("processName", out var nameElement))
                        {
                            processName = nameElement.GetString();
                        }
                        
                        if (command.payload.Value.TryGetProperty("pid", out var pidElement))
                        {
                            processPid = pidElement.GetInt32();
                        }
                    }

                    if (string.IsNullOrWhiteSpace(processName) && !processPid.HasValue)
                    {
                        status = "FAILED";
                        errorMessage = "No processName or pid provided in payload";
                        break;
                    }

                    var killedProcesses = new List<string>();
                    int killedCount = 0;

                    try
                    {
                        Process[] targetProcesses;

                        // Kill by PID
                        if (processPid.HasValue)
                        {
                            try
                            {
                                var process = Process.GetProcessById(processPid.Value);
                                var procName = process.ProcessName;
                                _logger.Information("Killing process by PID: {Pid} ({Name})", processPid.Value, procName);
                                
                                process.Kill(entireProcessTree: true);
                                killedProcesses.Add($"{procName} (PID: {processPid.Value})");
                                killedCount++;
                                
                                _logger.Information("Successfully killed process {Pid}", processPid.Value);
                            }
                            catch (ArgumentException)
                            {
                                _logger.Warning("Process with PID {Pid} not found", processPid.Value);
                                errorMessage = $"Process with PID {processPid.Value} not found";
                            }
                            catch (System.ComponentModel.Win32Exception ex)
                            {
                                _logger.Error(ex, "Access denied killing process {Pid}", processPid.Value);
                                status = "FAILED";
                                errorMessage = $"Access denied killing process {processPid.Value}: {ex.Message}";
                            }
                        }
                        // Kill by name (may match multiple processes)
                        else if (!string.IsNullOrWhiteSpace(processName))
                        {
                            // Remove .exe extension if provided
                            processName = processName.Replace(".exe", "", StringComparison.OrdinalIgnoreCase);
                            
                            _logger.Information("Searching for processes with name: {ProcessName}", processName);
                            targetProcesses = Process.GetProcessesByName(processName);

                            if (targetProcesses.Length == 0)
                            {
                                _logger.Warning("No processes found with name: {ProcessName}", processName);
                                errorMessage = $"No processes found with name: {processName}";
                            }
                            else
                            {
                                _logger.Information("Found {Count} process(es) matching {ProcessName}", targetProcesses.Length, processName);

                                foreach (var proc in targetProcesses)
                                {
                                    try
                                    {
                                        var pid = proc.Id;
                                        var name = proc.ProcessName;
                                        
                                        _logger.Information("Killing process: {Name} (PID: {Pid})", name, pid);
                                        proc.Kill(entireProcessTree: true);
                                        
                                        killedProcesses.Add($"{name} (PID: {pid})");
                                        killedCount++;
                                    }
                                    catch (System.ComponentModel.Win32Exception ex)
                                    {
                                        _logger.Error(ex, "Failed to kill process {ProcessName} (PID: {Pid})", proc.ProcessName, proc.Id);
                                        // Continue to next process even if one fails
                                    }
                                    catch (InvalidOperationException ex)
                                    {
                                        _logger.Warning(ex, "Process {ProcessName} (PID: {Pid}) already exited", proc.ProcessName, proc.Id);
                                        // Process already exited, consider it a success
                                    }
                                    finally
                                    {
                                        proc.Dispose();
                                    }
                                }
                            }
                        }

                        resultData["killedCount"] = killedCount;
                        resultData["killedAt"] = DateTime.UtcNow.ToString("o");
                        resultData["processName"] = processName ?? $"PID:{processPid}";
                        
                        if (killedProcesses.Count > 0)
                        {
                            resultData["killedProcesses"] = killedProcesses;
                        }

                        if (killedCount == 0 && string.IsNullOrEmpty(errorMessage))
                        {
                            status = "COMPLETED"; // Not a failure, just no processes found
                        }
                        
                        _logger.Information("KILL_PROCESS completed: {Count} process(es) terminated", killedCount);
                    }
                    catch (Exception killEx)
                    {
                        status = "FAILED";
                        errorMessage = $"Process termination error: {killEx.Message}";
                        _logger.Error(killEx, "KILL_PROCESS execution failed");
                    }
                    break;

                case "USB_LOCK":
                    _logger.Information("Executing USB_LOCK command");
                    
                    string? usbMode = null;
                    
                    // Extract mode from payload
                    if (command.payload.HasValue)
                    {
                        if (command.payload.Value.TryGetProperty("mode", out var modeElement))
                        {
                            usbMode = modeElement.GetString()?.ToUpperInvariant();
                        }
                    }

                    if (string.IsNullOrWhiteSpace(usbMode))
                    {
                        status = "FAILED";
                        errorMessage = "No mode provided in payload. Valid modes: DISABLE, READ_ONLY, ENABLE";
                        break;
                    }

                    try
                    {
                        const string USBSTOR_KEY_PATH = @"SYSTEM\CurrentControlSet\Services\USBSTOR";
                        const string STORAGE_POLICIES_KEY_PATH = @"SYSTEM\CurrentControlSet\Control\StorageDevicePolicies";

                        switch (usbMode)
                        {
                            case "DISABLE":
                                _logger.Information("Disabling USB storage devices");
                                
                                // Set USBSTOR Start = 4 (disabled)
                                using (var usbstorKey = Registry.LocalMachine.OpenSubKey(USBSTOR_KEY_PATH, writable: true))
                                {
                                    if (usbstorKey != null)
                                    {
                                        usbstorKey.SetValue("Start", 4, RegistryValueKind.DWord);
                                        _logger.Information("Set USBSTOR Start = 4 (disabled)");
                                    }
                                    else
                                    {
                                        _logger.Warning("USBSTOR registry key not found");
                                    }
                                }

                                resultData["mode"] = "DISABLED";
                                resultData["description"] = "USB storage devices are now disabled. No USB drives can be accessed.";
                                break;

                            case "READ_ONLY":
                                _logger.Information("Setting USB storage devices to read-only");
                                
                                // Ensure USBSTOR is enabled first (Start = 3)
                                using (var usbstorKey = Registry.LocalMachine.OpenSubKey(USBSTOR_KEY_PATH, writable: true))
                                {
                                    if (usbstorKey != null)
                                    {
                                        usbstorKey.SetValue("Start", 3, RegistryValueKind.DWord);
                                        _logger.Information("Set USBSTOR Start = 3 (enabled)");
                                    }
                                }

                                // Create StorageDevicePolicies key if it doesn't exist
                                using (var policiesKey = Registry.LocalMachine.CreateSubKey(STORAGE_POLICIES_KEY_PATH, writable: true))
                                {
                                    if (policiesKey != null)
                                    {
                                        policiesKey.SetValue("WriteProtect", 1, RegistryValueKind.DWord);
                                        _logger.Information("Set WriteProtect = 1 (read-only enabled)");
                                    }
                                }

                                resultData["mode"] = "READ_ONLY";
                                resultData["description"] = "USB storage devices are read-only. Files can be read but not written or deleted.";
                                break;

                            case "ENABLE":
                                _logger.Information("Enabling USB storage devices (full access)");
                                
                                // Set USBSTOR Start = 3 (enabled)
                                using (var usbstorKey = Registry.LocalMachine.OpenSubKey(USBSTOR_KEY_PATH, writable: true))
                                {
                                    if (usbstorKey != null)
                                    {
                                        usbstorKey.SetValue("Start", 3, RegistryValueKind.DWord);
                                        _logger.Information("Set USBSTOR Start = 3 (enabled)");
                                    }
                                }

                                // Remove write protection
                                using (var policiesKey = Registry.LocalMachine.OpenSubKey(STORAGE_POLICIES_KEY_PATH, writable: true))
                                {
                                    if (policiesKey != null)
                                    {
                                        policiesKey.SetValue("WriteProtect", 0, RegistryValueKind.DWord);
                                        _logger.Information("Set WriteProtect = 0 (write protection disabled)");
                                    }
                                    else
                                    {
                                        // Key doesn't exist, which means no write protection (default enabled state)
                                        _logger.Information("StorageDevicePolicies key doesn't exist - write protection already disabled");
                                    }
                                }

                                resultData["mode"] = "ENABLED";
                                resultData["description"] = "USB storage devices are fully enabled. Full read/write access.";
                                break;

                            default:
                                status = "FAILED";
                                errorMessage = $"Invalid mode: {usbMode}. Valid modes: DISABLE, READ_ONLY, ENABLE";
                                break;
                        }

                        if (status != "FAILED")
                        {
                            resultData["appliedAt"] = DateTime.UtcNow.ToString("o");
                            resultData["requestedMode"] = usbMode;
                            resultData["requiresReboot"] = false; // Changes take effect immediately for new devices
                            resultData["note"] = "Already connected USB devices may need to be unplugged and re-plugged for changes to take effect.";
                            
                            _logger.Information("USB_LOCK completed successfully: mode={Mode}", usbMode);
                        }
                    }
                    catch (UnauthorizedAccessException uaEx)
                    {
                        status = "FAILED";
                        errorMessage = $"Access denied to registry. Agent must run with administrator privileges: {uaEx.Message}";
                        _logger.Error(uaEx, "USB_LOCK failed - insufficient permissions");
                    }
                    catch (System.Security.SecurityException secEx)
                    {
                        status = "FAILED";
                        errorMessage = $"Security exception accessing registry: {secEx.Message}";
                        _logger.Error(secEx, "USB_LOCK failed - security exception");
                    }
                    catch (Exception usbEx)
                    {
                        status = "FAILED";
                        errorMessage = $"USB lock error: {usbEx.Message}";
                        _logger.Error(usbEx, "USB_LOCK execution failed");
                    }
                    break;

                case "SEND_NOTIFICATION":
                    _logger.Information("Executing SEND_NOTIFICATION command");
                    
                    string? notificationTitle = null;
                    string? notificationMessage = null;
                    
                    // Extract title and message from payload
                    if (command.payload.HasValue)
                    {
                        if (command.payload.Value.TryGetProperty("title", out var titleElement))
                        {
                            notificationTitle = titleElement.GetString();
                        }
                        
                        if (command.payload.Value.TryGetProperty("message", out var messageElement))
                        {
                            notificationMessage = messageElement.GetString();
                        }
                    }

                    if (string.IsNullOrWhiteSpace(notificationTitle))
                    {
                        notificationTitle = "SentinelOps Notification"; // Default title
                    }

                    if (string.IsNullOrWhiteSpace(notificationMessage))
                    {
                        status = "FAILED";
                        errorMessage = "No message provided in payload";
                        break;
                    }

                    try
                    {
                        _logger.Information("Displaying Windows toast notification: {Title}", notificationTitle);
                        
                        // Build and show the toast notification
                        new ToastContentBuilder()
                            .AddText(notificationTitle)
                            .AddText(notificationMessage)
                            .Show();
                        
                        resultData["notifiedAt"] = DateTime.UtcNow.ToString("o");
                        resultData["title"] = notificationTitle;
                        resultData["message"] = notificationMessage;
                        resultData["displayed"] = true;
                        
                        _logger.Information("Notification displayed successfully");
                    }
                    catch (Exception notifEx)
                    {
                        status = "FAILED";
                        errorMessage = $"Notification display error: {notifEx.Message}";
                        _logger.Error(notifEx, "Failed to display notification");
                        
                        // Additional context for troubleshooting
                        if (notifEx.Message.Contains("AUMID"))
                        {
                            errorMessage += " (Application User Model ID issue - agent may need to run as user service)";
                        }
                    }
                    break;

                case "TAKE_SCREENSHOT":
                    _logger.Information("Executing TAKE_SCREENSHOT command");
                    
                    var screenshots = new List<string>();
                    var screenshotMetadata = new List<object>();
                    
                    try
                    {
                        var allScreens = Screen.AllScreens;
                        _logger.Information("Capturing screenshots from {ScreenCount} screen(s)", allScreens.Length);

                        for (int i = 0; i < allScreens.Length; i++)
                        {
                            var screen = allScreens[i];
                            
                            try
                            {
                                _logger.Information("Capturing screen {Index}: {Bounds} (Primary: {IsPrimary})", 
                                    i, screen.Bounds, screen.Primary);

                                // Create bitmap with screen dimensions
                                using var bitmap = new Bitmap(screen.Bounds.Width, screen.Bounds.Height, PixelFormat.Format32bppArgb);
                                using var graphics = Graphics.FromImage(bitmap);
                                
                                // Copy screen content to bitmap
                                graphics.CopyFromScreen(
                                    screen.Bounds.X, 
                                    screen.Bounds.Y, 
                                    0, 
                                    0, 
                                    screen.Bounds.Size, 
                                    CopyPixelOperation.SourceCopy
                                );

                                // Convert to JPEG in memory
                                using var memoryStream = new MemoryStream();
                                bitmap.Save(memoryStream, ImageFormat.Jpeg);
                                
                                // Convert to base64
                                var base64Image = Convert.ToBase64String(memoryStream.ToArray());
                                screenshots.Add(base64Image);

                                // Store metadata
                                screenshotMetadata.Add(new
                                {
                                    screenIndex = i,
                                    width = screen.Bounds.Width,
                                    height = screen.Bounds.Height,
                                    isPrimary = screen.Primary,
                                    deviceName = screen.DeviceName,
                                    sizeKB = memoryStream.Length / 1024
                                });

                                _logger.Information("Screen {Index} captured successfully: {Width}x{Height}, {SizeKB} KB", 
                                    i, screen.Bounds.Width, screen.Bounds.Height, memoryStream.Length / 1024);
                            }
                            catch (Exception screenEx)
                            {
                                _logger.Error(screenEx, "Failed to capture screen {Index}", i);
                                // Continue to next screen even if one fails
                            }
                        }

                        if (screenshots.Count == 0)
                        {
                            status = "FAILED";
                            errorMessage = "No screenshots could be captured";
                            break;
                        }

                        // Upload screenshots to backend
                        _logger.Information("Uploading {Count} screenshot(s) to backend", screenshots.Count);
                        
                        var uploadPayload = new
                        {
                            commandId = command.id,
                            screenshots = screenshots,
                            capturedAt = DateTime.UtcNow.ToString("o"),
                            deviceKey = _config.DeviceKey,
                            metadata = screenshotMetadata
                        };

                        var uploadResponse = await _client.PostAsync<object>("/evidence/screenshot", uploadPayload, cancellationToken);

                        if (uploadResponse.IsSuccess)
                        {
                            _logger.Information("Screenshots uploaded successfully");
                            
                            resultData["screenshotCount"] = screenshots.Count;
                            resultData["capturedAt"] = DateTime.UtcNow.ToString("o");
                            resultData["uploaded"] = true;
                            resultData["screens"] = screenshotMetadata;
                            resultData["totalSizeKB"] = screenshotMetadata.Sum(m => ((dynamic)m).sizeKB);
                        }
                        else
                        {
                            status = "FAILED";
                            errorMessage = $"Screenshot upload failed: {uploadResponse.ErrorMessage}";
                            _logger.Error("Screenshot upload failed: {Error}", uploadResponse.ErrorMessage);
                        }
                    }
                    catch (Exception screenshotEx)
                    {
                        status = "FAILED";
                        errorMessage = $"Screenshot capture error: {screenshotEx.Message}";
                        _logger.Error(screenshotEx, "TAKE_SCREENSHOT execution failed");
                    }
                    break;

                case "LOCATE_DEVICE":
                    _logger.Information("Executing LOCATE_DEVICE command");
                    
                    double? latitude = null;
                    double? longitude = null;
                    double? accuracy = null;
                    string locationSource = "UNKNOWN";
                    
                    try
                    {
                        // Note: GeoCoordinateWatcher is deprecated and doesn't work reliably on desktop Windows
                        // Most desktop PCs don't have GPS hardware
                        // We'll use IP-based geolocation as primary method for desktop devices
                        
                        _logger.Information("Attempting IP-based geolocation (primary method for desktop)");
                        
                        try
                        {
                            // Use ip-api.com for IP-based geolocation (free, no API key required)
                            using var httpClient = new HttpClient();
                            httpClient.Timeout = TimeSpan.FromSeconds(10);
                            
                            var response = await httpClient.GetStringAsync("http://ip-api.com/json/?fields=status,message,country,city,lat,lon,isp,query");
                            var geoData = JsonSerializer.Deserialize<JsonElement>(response);
                            
                            if (geoData.TryGetProperty("status", out var statusElement) && 
                                statusElement.GetString() == "success")
                            {
                                if (geoData.TryGetProperty("lat", out var latElement) &&
                                    geoData.TryGetProperty("lon", out var lonElement))
                                {
                                    latitude = latElement.GetDouble();
                                    longitude = lonElement.GetDouble();
                                    locationSource = "IP_GEOLOCATION";
                                    
                                    // IP geolocation accuracy is typically city-level (~5-50 km radius)
                                    accuracy = 25000; // 25km average accuracy in meters
                                    
                                    _logger.Information("IP geolocation successful: {Lat}, {Lon}", latitude, longitude);
                                    
                                    // Add additional context
                                    if (geoData.TryGetProperty("country", out var countryElement))
                                    {
                                        resultData["country"] = countryElement.GetString();
                                    }
                                    
                                    if (geoData.TryGetProperty("city", out var cityElement))
                                    {
                                        resultData["city"] = cityElement.GetString();
                                    }
                                    
                                    if (geoData.TryGetProperty("isp", out var ispElement))
                                    {
                                        resultData["isp"] = ispElement.GetString();
                                    }
                                    
                                    if (geoData.TryGetProperty("query", out var ipElement))
                                    {
                                        resultData["publicIP"] = ipElement.GetString();
                                    }
                                }
                            }
                            else
                            {
                                _logger.Warning("IP geolocation API returned non-success status");
                            }
                        }
                        catch (HttpRequestException httpEx)
                        {
                            _logger.Warning(httpEx, "IP geolocation HTTP request failed");
                        }
                        catch (TaskCanceledException timeoutEx)
                        {
                            _logger.Warning(timeoutEx, "IP geolocation request timed out");
                        }
                        catch (Exception ipEx)
                        {
                            _logger.Warning(ipEx, "IP geolocation failed");
                        }
                        
                        // If IP geolocation failed, try to get system location (Windows Location API)
                        // Note: This requires user consent and location services enabled
                        if (!latitude.HasValue || !longitude.HasValue)
                        {
                            _logger.Information("IP geolocation unavailable, attempting Windows Location API");
                            locationSource = "SYSTEM_LOCATION_UNAVAILABLE";
                            
                            // Windows Location API requires COM and user permissions
                            // For enterprise deployment, IP geolocation is more reliable
                            _logger.Warning("Windows Location API not implemented (requires user consent, GPS hardware rare on desktops)");
                        }
                        
                        if (latitude.HasValue && longitude.HasValue)
                        {
                            resultData["latitude"] = latitude.Value;
                            resultData["longitude"] = longitude.Value;
                            resultData["accuracy"] = accuracy ?? 25000;
                            resultData["source"] = locationSource;
                            resultData["locatedAt"] = DateTime.UtcNow.ToString("o");
                            resultData["method"] = "IP_GEOLOCATION";
                            
                            _logger.Information("Device located: {Lat}, {Lon} (source: {Source})", 
                                latitude, longitude, locationSource);
                        }
                        else
                        {
                            status = "FAILED";
                            errorMessage = "Unable to determine device location. IP geolocation failed and GPS not available on desktop.";
                            _logger.Error("Location detection failed completely");
                        }
                    }
                    catch (Exception locateEx)
                    {
                        status = "FAILED";
                        errorMessage = $"Location detection error: {locateEx.Message}";
                        _logger.Error(locateEx, "LOCATE_DEVICE execution failed");
                    }
                    break;

                case "WIPE":
                    _logger.Warning("⚠️ EXECUTING WIPE COMMAND - DEVICE WILL BE FACTORY RESET ⚠️");
                    
                    try
                    {
                        // CRITICAL: This command will PERMANENTLY DELETE all data on the device
                        // It triggers Windows Recovery Environment (WinRE) factory reset
                        // This is IRREVERSIBLE - all user data, applications, settings will be lost
                        
                        _logger.Warning("Starting Windows Recovery Environment boot process");
                        
                        // Step 1: Enable WinRE boot (reagentc = Recovery Agent Configuration)
                        // This tells Windows to boot into Recovery Environment on next restart
                        var reagentProcess = new Process
                        {
                            StartInfo = new ProcessStartInfo
                            {
                                FileName = "reagentc.exe",
                                Arguments = "/boottore",  // Boot To Recovery Environment
                                CreateNoWindow = true,
                                UseShellExecute = false,
                                RedirectStandardOutput = true,
                                RedirectStandardError = true,
                                Verb = "runas"  // Requires admin privileges
                            }
                        };
                        
                        reagentProcess.Start();
                        var reagentOutput = await reagentProcess.StandardOutput.ReadToEndAsync();
                        var reagentError = await reagentProcess.StandardError.ReadToEndAsync();
                        reagentProcess.WaitForExit();
                        
                        _logger.Information("reagentc.exe exit code: {ExitCode}", reagentProcess.ExitCode);
                        _logger.Information("reagentc.exe output: {Output}", reagentOutput);
                        
                        if (reagentProcess.ExitCode != 0)
                        {
                            _logger.Error("reagentc.exe failed: {Error}", reagentError);
                            status = "FAILED";
                            errorMessage = $"Failed to enable recovery boot: {reagentError}";
                            break;
                        }
                        
                        // Step 2: Schedule immediate restart
                        _logger.Warning("Scheduling immediate system restart");
                        
                        var shutdownProcess = Process.Start(new ProcessStartInfo
                        {
                            FileName = "shutdown.exe",
                            Arguments = "/r /t 0 /c \"SentinelOps Remote Wipe - Device will be factory reset\"",
                            CreateNoWindow = true,
                            UseShellExecute = false
                        });
                        
                        // Result data
                        resultData["wipeInitiatedAt"] = DateTime.UtcNow.ToString("o");
                        resultData["wipeMethod"] = "WINDOWS_RECOVERY_ENVIRONMENT";
                        resultData["restartScheduled"] = true;
                        resultData["dataLoss"] = "TOTAL";
                        resultData["reversible"] = false;
                        resultData["warning"] = "Device will boot into Windows Recovery Environment and prompt for factory reset";
                        
                        _logger.Warning("⚠️ WIPE COMMAND EXECUTED - DEVICE RESTARTING TO RECOVERY ENVIRONMENT ⚠️");
                        _logger.Warning("ALL USER DATA WILL BE LOST");
                    }
                    catch (Exception wipeEx)
                    {
                        status = "FAILED";
                        errorMessage = $"Wipe command error: {wipeEx.Message}";
                        _logger.Error(wipeEx, "WIPE command execution failed");
                    }
                    break;

                case "NETWORK_ISOLATE":
                    _logger.Warning("Executing NETWORK_ISOLATE command - blocking all network traffic except management");
                    
                    try
                    {
                        // Step 1: Enable Windows Firewall on all profiles
                        _logger.Information("Enabling Windows Firewall on all profiles");
                        var firewallEnableProcess = Process.Start(new ProcessStartInfo
                        {
                            FileName = "netsh",
                            Arguments = "advfirewall set allprofiles state on",
                            CreateNoWindow = true,
                            UseShellExecute = false,
                            RedirectStandardOutput = true,
                            RedirectStandardError = true
                        });
                        
                        if (firewallEnableProcess != null)
                        {
                            await firewallEnableProcess.WaitForExitAsync(cancellationToken);
                            var enableOutput = await firewallEnableProcess.StandardOutput.ReadToEndAsync();
                            _logger.Information("Firewall enable output: {Output}", enableOutput);
                        }
                        
                        // Step 2: Block all outbound traffic (default deny)
                        _logger.Information("Adding firewall rule to block all outbound traffic");
                        var blockProcess = Process.Start(new ProcessStartInfo
                        {
                            FileName = "netsh",
                            Arguments = "advfirewall firewall add rule name=\"SentinelBlock\" dir=out action=block",
                            CreateNoWindow = true,
                            UseShellExecute = false,
                            RedirectStandardOutput = true,
                            RedirectStandardError = true
                        });
                        
                        if (blockProcess != null)
                        {
                            await blockProcess.WaitForExitAsync(cancellationToken);
                            var blockOutput = await blockProcess.StandardOutput.ReadToEndAsync();
                            _logger.Information("Block rule output: {Output}", blockOutput);
                            
                            if (blockProcess.ExitCode != 0)
                            {
                                var blockError = await blockProcess.StandardError.ReadToEndAsync();
                                _logger.Error("Block rule failed: {Error}", blockError);
                                status = "FAILED";
                                errorMessage = $"Failed to create block rule: {blockError}";
                                break;
                            }
                        }
                        
                        // Step 3: Allow management channel (preserve agent communication)
                        // Extract server IP from API URL
                        var serverUri = new Uri(_config.ApiUrl);
                        var serverHost = serverUri.Host;
                        
                        _logger.Information("Adding firewall rule to allow management channel: {ServerHost}", serverHost);
                        
                        // Allow HTTPS (443) to management server
                        var allowProcess = Process.Start(new ProcessStartInfo
                        {
                            FileName = "netsh",
                            Arguments = $"advfirewall firewall add rule name=\"SentinelMgmt\" dir=out action=allow remoteip={serverHost} protocol=tcp remoteport=443",
                            CreateNoWindow = true,
                            UseShellExecute = false,
                            RedirectStandardOutput = true,
                            RedirectStandardError = true
                        });
                        
                        if (allowProcess != null)
                        {
                            await allowProcess.WaitForExitAsync(cancellationToken);
                            var allowOutput = await allowProcess.StandardOutput.ReadToEndAsync();
                            _logger.Information("Allow rule output: {Output}", allowOutput);
                            
                            if (allowProcess.ExitCode != 0)
                            {
                                var allowError = await allowProcess.StandardError.ReadToEndAsync();
                                _logger.Error("Allow rule failed: {Error}", allowError);
                                status = "FAILED";
                                errorMessage = $"Failed to create allow rule: {allowError}";
                                break;
                            }
                        }
                        
                        resultData["isolatedAt"] = DateTime.UtcNow.ToString("o");
                        resultData["managementChannelPreserved"] = true;
                        resultData["managementServer"] = serverHost;
                        resultData["blockedTraffic"] = "ALL_OUTBOUND_EXCEPT_MANAGEMENT";
                        resultData["firewallEnabled"] = true;
                        
                        _logger.Warning("Network isolation complete - device can only communicate with management server");
                    }
                    catch (Exception isolateEx)
                    {
                        status = "FAILED";
                        errorMessage = $"Network isolation error: {isolateEx.Message}";
                        _logger.Error(isolateEx, "NETWORK_ISOLATE execution failed");
                    }
                    break;

                case "NETWORK_RESTORE":
                    _logger.Information("Executing NETWORK_RESTORE command - removing network isolation");
                    
                    try
                    {
                        // Step 1: Delete the block rule
                        _logger.Information("Deleting SentinelBlock firewall rule");
                        var deleteBlockProcess = Process.Start(new ProcessStartInfo
                        {
                            FileName = "netsh",
                            Arguments = "advfirewall firewall delete rule name=\"SentinelBlock\"",
                            CreateNoWindow = true,
                            UseShellExecute = false,
                            RedirectStandardOutput = true,
                            RedirectStandardError = true
                        });
                        
                        if (deleteBlockProcess != null)
                        {
                            await deleteBlockProcess.WaitForExitAsync(cancellationToken);
                            var deleteBlockOutput = await deleteBlockProcess.StandardOutput.ReadToEndAsync();
                            _logger.Information("Delete block rule output: {Output}", deleteBlockOutput);
                        }
                        
                        // Step 2: Delete the allow rule
                        _logger.Information("Deleting SentinelMgmt firewall rule");
                        var deleteAllowProcess = Process.Start(new ProcessStartInfo
                        {
                            FileName = "netsh",
                            Arguments = "advfirewall firewall delete rule name=\"SentinelMgmt\"",
                            CreateNoWindow = true,
                            UseShellExecute = false,
                            RedirectStandardOutput = true,
                            RedirectStandardError = true
                        });
                        
                        if (deleteAllowProcess != null)
                        {
                            await deleteAllowProcess.WaitForExitAsync(cancellationToken);
                            var deleteAllowOutput = await deleteAllowProcess.StandardOutput.ReadToEndAsync();
                            _logger.Information("Delete allow rule output: {Output}", deleteAllowOutput);
                        }
                        
                        resultData["restoredAt"] = DateTime.UtcNow.ToString("o");
                        resultData["networkAccess"] = "RESTORED";
                        resultData["firewallRulesRemoved"] = new[] { "SentinelBlock", "SentinelMgmt" };
                        
                        _logger.Information("Network access restored - device can communicate normally");
                    }
                    catch (Exception restoreEx)
                    {
                        status = "FAILED";
                        errorMessage = $"Network restore error: {restoreEx.Message}";
                        _logger.Error(restoreEx, "NETWORK_RESTORE execution failed");
                    }
                    break;

                case "SYNC_POLICY":
                    _logger.Information("Executing SYNC_POLICY command - synchronizing device policies");
                    
                    try
                    {
                        // Fetch policy configuration from backend
                        _logger.Information("Fetching device policy from backend");
                        
                        var policyResponse = await _client.GetAsync<JsonElement>("/policies/device-policy", cancellationToken);
                        
                        if (!policyResponse.IsSuccess)
                        {
                            status = "FAILED";
                            errorMessage = $"Failed to fetch policy: {policyResponse.ErrorMessage}";
                            _logger.Error("Policy fetch failed: {Error}", policyResponse.ErrorMessage);
                            break;
                        }
                        
                        var policyData = policyResponse.Data;
                        
                        // Extract policy information
                        string? policyVersion = null;
                        if (policyData.TryGetProperty("version", out var versionElement))
                        {
                            policyVersion = versionElement.GetString();
                        }
                        
                        _logger.Information("Policy received - Version: {Version}", policyVersion ?? "unknown");
                        
                        // Save policy to local configuration file for persistence
                        var policyFilePath = Path.Combine(
                            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                            "SentinelOps",
                            "policy.json"
                        );
                        
                        var policyDirectory = Path.GetDirectoryName(policyFilePath);
                        if (!Directory.Exists(policyDirectory))
                        {
                            Directory.CreateDirectory(policyDirectory);
                        }
                        
                        await File.WriteAllTextAsync(policyFilePath, policyData.GetRawText(), cancellationToken);
                        _logger.Information("Policy saved to: {FilePath}", policyFilePath);
                        
                        // Apply policy-driven settings
                        var appliedSettings = new List<string>();
                        
                        // 1. Update monitoring intervals (if specified in policy)
                        if (policyData.TryGetProperty("heartbeatIntervalSeconds", out var heartbeatElement))
                        {
                            var newInterval = heartbeatElement.GetInt32();
                            _logger.Information("Policy specifies heartbeat interval: {Interval}s", newInterval);
                            appliedSettings.Add($"heartbeatInterval={newInterval}");
                            // Note: Actual interval change requires config update and service restart
                        }
                        
                        if (policyData.TryGetProperty("inventoryIntervalSeconds", out var inventoryElement))
                        {
                            var newInterval = inventoryElement.GetInt32();
                            _logger.Information("Policy specifies inventory interval: {Interval}s", newInterval);
                            appliedSettings.Add($"inventoryInterval={newInterval}");
                        }
                        
                        // 2. Process blacklist (if specified)
                        if (policyData.TryGetProperty("blacklistedProcesses", out var blacklistElement) && 
                            blacklistElement.ValueKind == JsonValueKind.Array)
                        {
                            var blacklistedProcesses = new List<string>();
                            foreach (var process in blacklistElement.EnumerateArray())
                            {
                                blacklistedProcesses.Add(process.GetString() ?? "");
                            }
                            
                            _logger.Information("Policy blacklist: {Count} processes", blacklistedProcesses.Count);
                            appliedSettings.Add($"blacklistedProcesses={blacklistedProcesses.Count}");
                            
                            // Store blacklist for monitoring worker (future: auto-kill blacklisted processes)
                            resultData["blacklistedProcesses"] = blacklistedProcesses;
                        }
                        
                        // 3. USB policy (if specified)
                        if (policyData.TryGetProperty("usbPolicy", out var usbElement))
                        {
                            var usbPolicy = usbElement.GetString();
                            _logger.Information("Policy USB setting: {Policy}", usbPolicy);
                            appliedSettings.Add($"usbPolicy={usbPolicy}");
                            // Note: Actual USB enforcement via USB_LOCK command
                        }
                        
                        // 4. Network isolation policy (if specified)
                        if (policyData.TryGetProperty("networkIsolationEnabled", out var networkElement))
                        {
                            var isolationEnabled = networkElement.GetBoolean();
                            _logger.Information("Policy network isolation: {Enabled}", isolationEnabled);
                            appliedSettings.Add($"networkIsolation={isolationEnabled}");
                        }
                        
                        // 5. Screenshot policy (if specified)
                        if (policyData.TryGetProperty("screenshotIntervalMinutes", out var screenshotElement))
                        {
                            var screenshotInterval = screenshotElement.GetInt32();
                            _logger.Information("Policy screenshot interval: {Interval} minutes", screenshotInterval);
                            appliedSettings.Add($"screenshotInterval={screenshotInterval}");
                        }
                        
                        resultData["syncedAt"] = DateTime.UtcNow.ToString("o");
                        resultData["policyVersion"] = policyVersion ?? "unknown";
                        resultData["policyFilePath"] = policyFilePath;
                        resultData["appliedSettings"] = appliedSettings;
                        resultData["settingsCount"] = appliedSettings.Count;
                        
                        _logger.Information("Policy sync complete - {Count} settings recognized", appliedSettings.Count);
                    }
                    catch (Exception policyEx)
                    {
                        status = "FAILED";
                        errorMessage = $"Policy sync error: {policyEx.Message}";
                        _logger.Error(policyEx, "SYNC_POLICY execution failed");
                    }
                    break;

                case "DIAGNOSTIC_BUNDLE":
                    _logger.Information("Executing DIAGNOSTIC_BUNDLE - Full forensic collection starting");
                    
                    try
                    {
                        // Step 1: Collect all forensic data
                        var forensicCollector = new ForensicCollector();
                        var bundle = forensicCollector.CollectAll();
                        
                        _logger.Information("Forensic collection complete - {Count} total artifacts", bundle.GetTotalArtifactCount());
                        
                        // Step 2: Serialize to JSON
                        var jsonOptions = new JsonSerializerOptions
                        {
                            WriteIndented = true,
                            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                        };
                        
                        var bundleJson = JsonSerializer.Serialize(bundle, jsonOptions);
                        var jsonBytes = System.Text.Encoding.UTF8.GetBytes(bundleJson);
                        
                        _logger.Information("Forensic bundle serialized - {Size} KB JSON", jsonBytes.Length / 1024);
                        
                        // Step 3: Create ZIP archive
                        var tempZipPath = Path.Combine(Path.GetTempPath(), $"sentinel-forensic-{Guid.NewGuid()}.zip");
                        
                        using (var zipArchive = ZipFile.Open(tempZipPath, ZipArchiveMode.Create))
                        {
                            var jsonEntry = zipArchive.CreateEntry("forensic-bundle.json", CompressionLevel.Optimal);
                            using (var entryStream = jsonEntry.Open())
                            {
                                await entryStream.WriteAsync(jsonBytes, 0, jsonBytes.Length, cancellationToken);
                            }
                            
                            // Add metadata file
                            var metadataEntry = zipArchive.CreateEntry("metadata.txt", CompressionLevel.Optimal);
                            using (var metadataStream = metadataEntry.Open())
                            using (var writer = new StreamWriter(metadataStream))
                            {
                                await writer.WriteLineAsync($"SentinelOps Forensic Diagnostic Bundle");
                                await writer.WriteLineAsync($"Collection Date: {bundle.CollectionStarted:yyyy-MM-dd HH:mm:ss} UTC");
                                await writer.WriteLineAsync($"Device: {bundle.MachineName}");
                                await writer.WriteLineAsync($"User: {bundle.UserName}");
                                await writer.WriteLineAsync($"OS: {bundle.OsVersion}");
                                await writer.WriteLineAsync($"Hardware Hash: {bundle.HardwareHash}");
                                await writer.WriteLineAsync($"Duration: {bundle.CollectionDurationMs}ms");
                                await writer.WriteLineAsync($"Total Artifacts: {bundle.GetTotalArtifactCount()}");
                                await writer.WriteLineAsync($"");
                                await writer.WriteLineAsync($"Artifact Breakdown:");
                                await writer.WriteLineAsync($"  - Network Connections: {bundle.NetworkConnections.Count}");
                                await writer.WriteLineAsync($"  - DNS Cache Entries: {bundle.DnsCache.Count}");
                                await writer.WriteLineAsync($"  - Firewall Rules: {bundle.FirewallRules.Count}");
                                await writer.WriteLineAsync($"  - Running Processes: {bundle.RunningProcesses.Count}");
                                await writer.WriteLineAsync($"  - Scheduled Tasks: {bundle.ScheduledTasks.Count}");
                                await writer.WriteLineAsync($"  - AutoRun Entries: {bundle.AutoRunEntries.Count}");
                                await writer.WriteLineAsync($"  - Installed Drivers: {bundle.InstalledDrivers.Count}");
                                await writer.WriteLineAsync($"  - Security Events: {bundle.SecurityEvents.Count}");
                            }
                        }
                        
                        var zipFileInfo = new FileInfo(tempZipPath);
                        _logger.Information("Forensic bundle compressed - {Size} KB ZIP", zipFileInfo.Length / 1024);
                        
                        // Step 4: Upload to backend
                        _logger.Information("Uploading forensic bundle to backend...");
                        
                        using (var fileStream = File.OpenRead(tempZipPath))
                        {
                            var uploadContent = new MultipartFormDataContent();
                            var streamContent = new StreamContent(fileStream);
                            streamContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/zip");
                            
                            uploadContent.Add(streamContent, "bundle", Path.GetFileName(tempZipPath));
                            uploadContent.Add(new StringContent(command.id.ToString()), "commandId");
                            uploadContent.Add(new StringContent(_config.DeviceId), "deviceId");
                            uploadContent.Add(new StringContent(bundle.MachineName), "deviceName");
                            uploadContent.Add(new StringContent(bundle.HardwareHash), "hardwareHash");
                            uploadContent.Add(new StringContent(bundle.GetTotalArtifactCount().ToString()), "artifactCount");
                            
                            var uploadResponse = await _client.PostMultipartAsync<JsonElement>(
                                "/evidence/bundle", 
                                uploadContent, 
                                cancellationToken
                            );
                            
                            if (uploadResponse.IsSuccess && uploadResponse.Data.TryGetProperty("bundleId", out var bundleIdElement))
                            {
                                var bundleId = bundleIdElement.GetString();
                                _logger.Information("Forensic bundle uploaded successfully - Bundle ID: {BundleId}", bundleId);
                                
                                resultData["bundleId"] = bundleId;
                                resultData["artifactCount"] = bundle.GetTotalArtifactCount();
                                resultData["sizeBytes"] = zipFileInfo.Length;
                                resultData["collectionDurationMs"] = bundle.CollectionDurationMs;
                                resultData["uploadedAt"] = DateTime.UtcNow.ToString("o");
                                resultData["hardwareHash"] = bundle.HardwareHash;
                            }
                            else
                            {
                                status = "FAILED";
                                errorMessage = $"Bundle upload failed: {uploadResponse.ErrorMessage}";
                                _logger.Error("Forensic bundle upload failed: {Error}", uploadResponse.ErrorMessage);
                            }
                        }
                        
                        // Step 5: Cleanup temp file
                        try
                        {
                            File.Delete(tempZipPath);
                            _logger.Information("Temporary ZIP file deleted");
                        }
                        catch (Exception cleanupEx)
                        {
                            _logger.Warning(cleanupEx, "Failed to delete temporary ZIP file");
                        }
                    }
                    catch (Exception forensicEx)
                    {
                        status = "FAILED";
                        errorMessage = $"Forensic collection failed: {forensicEx.Message}";
                        _logger.Error(forensicEx, "DIAGNOSTIC_BUNDLE execution failed");
                    }
                    break;

                default:
                    status = "FAILED";
                    errorMessage = $"Unsupported command type: {command.actionType}";
                    break;
            }
        }
        catch (Exception ex)
        {
            status = "FAILED";
            errorMessage = ex.Message;
            _logger.Error(ex, "Execution error for command {CommandId}", command.id);
        }

        // Report result back to backend
        try
        {
            var resultPayload = new
            {
                commandId = command.id,
                status,
                result = resultData,
                errorMessage
            };

            await _client.PostAsync<object>("/remote-actions/result", resultPayload, cancellationToken);
            _logger.Information("Reported command {CommandId} execution outcome: {Status}", command.id, status);
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Failed to submit execution result for command {CommandId}", command.id);
        }
    }
}

public class CommandPollResponse
{
    public List<CommandItem>? commands { get; set; }
}

public class CommandItem
{
    public string id { get; set; } = string.Empty;
    public string actionType { get; set; } = string.Empty;
    public JsonElement? payload { get; set; }
}
