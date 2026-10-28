using Microsoft.Extensions.Options;
using Serilog;
using SentinelOpsAgent.Config;
using SentinelOpsAgent.Security;
using System.Management;

namespace SentinelOpsAgent.Enrollment;

public class EnrollmentManager
{
    private readonly ILogger _logger;
    private readonly AgentConfig _config;
    private readonly CommunicationClient _client;

    public EnrollmentManager(
        ILogger logger,
        IOptions<AgentConfig> config,
        CommunicationClient client)
    {
        _logger = logger;
        _config = config.Value;
        _client = client;
    }

    public async Task<bool> EnrollAsync(string enrollmentToken, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.Information("Starting device enrollment...");

            // Generate device ID from hardware fingerprint
            var deviceId = GenerateDeviceId();
            var deviceName = GetDeviceName();
            var osVersion = GetOsVersion();
            var hardwareInfo = GetHardwareInfo();

            var enrollmentRequest = new
            {
                token = enrollmentToken,
                deviceId,
                deviceName,
                platform = "WINDOWS",
                osVersion,
                hardwareInfo
            };

            var response = await _client.PostAsync<EnrollmentCredentialsResponse>("/enrollment/enroll", enrollmentRequest, cancellationToken);

            if (response.IsSuccess && response.Data != null)
            {
                var credentials = response.Data;
                _config.DeviceId = deviceId;
                _config.DeviceKey = credentials.deviceKey;
                _config.DeviceSecret = credentials.deviceSecret;
                _config.IsEnrolled = true;

                _logger.Information("Device enrolled successfully: {DeviceId}", deviceId);
                return true;
            }
            else
            {
                _logger.Error("Enrollment failed: {Error}", response.ErrorMessage);
                return false;
            }
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Enrollment error");
            return false;
        }
    }

    private string GenerateDeviceId()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT SerialNumber FROM Win32_BIOS");
            using var collection = searcher.Get();
            foreach (var item in collection)
            {
                var serial = item["SerialNumber"]?.ToString();
                if (!string.IsNullOrEmpty(serial))
                {
                    return Convert.ToHexString(System.Text.Encoding.UTF8.GetBytes(serial)).Substring(0, 16);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Failed to get BIOS serial, using fallback");
        }

        // Fallback to machine GUID
        return Guid.NewGuid().ToString("N");
    }

    private string GetDeviceName()
    {
        try
        {
            return Environment.MachineName;
        }
        catch
        {
            return "Unknown Device";
        }
    }

    private string GetOsVersion()
    {
        try
        {
            return Environment.OSVersion.VersionString;
        }
        catch
        {
            return "Unknown";
        }
    }

    private object GetHardwareInfo()
    {
        try
        {
            var hardwareInfo = new Dictionary<string, object>();

            // CPU
            using var cpuSearcher = new ManagementObjectSearcher("SELECT Name, NumberOfCores FROM Win32_Processor");
            foreach (var cpu in cpuSearcher.Get())
            {
                hardwareInfo["cpu"] = cpu["Name"]?.ToString();
                hardwareInfo["cpuCores"] = cpu["NumberOfCores"];
                break;
            }

            // RAM
            hardwareInfo["ram"] = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes / (1024 * 1024 * 1024);

            // Manufacturer
            using var systemSearcher = new ManagementObjectSearcher("SELECT Manufacturer, Model FROM Win32_ComputerSystem");
            foreach (var system in systemSearcher.Get())
            {
                hardwareInfo["manufacturer"] = system["Manufacturer"]?.ToString();
                hardwareInfo["model"] = system["Model"]?.ToString();
                break;
            }

            return hardwareInfo;
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Failed to get hardware info");
            return new Dictionary<string, object>();
        }
    }
}

public class EnrollmentCredentialsResponse
{
    public string deviceKey { get; set; } = string.Empty;
    public string deviceSecret { get; set; } = string.Empty;
    public string deviceId { get; set; } = string.Empty;
}
