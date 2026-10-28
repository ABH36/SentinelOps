using Microsoft.Extensions.Options;
using Serilog;
using SentinelOpsAgent.Config;
using SentinelOpsAgent.Security;
using System.Management;

namespace SentinelOpsAgent.Inventory;

public class InventoryCollector
{
    private readonly ILogger _logger;
    private readonly AgentConfig _config;
    private readonly CommunicationClient _client;

    public InventoryCollector(
        ILogger logger,
        IOptions<AgentConfig> config,
        CommunicationClient client)
    {
        _logger = logger;
        _config = config.Value;
        _client = client;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.Information("Starting inventory collection...");

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await CollectAndSubmitInventoryAsync(cancellationToken);
                await Task.Delay(TimeSpan.FromSeconds(_config.InventoryIntervalSeconds), cancellationToken);
            }
            catch (TaskCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Inventory collection error");
                await Task.Delay(TimeSpan.FromMinutes(5), cancellationToken);
            }
        }
    }

    /// <summary>
    /// Collects full device inventory and submits to backend.
    /// Can be called on-demand via REFRESH_INVENTORY command.
    /// </summary>
    public async Task CollectAndSubmitInventoryAsync(CancellationToken cancellationToken)
    {
        try
        {
            _logger.Information("Collecting device inventory...");

            var inventory = new
            {
                deviceKey = _config.DeviceKey,
                deviceSecret = _config.DeviceSecret,
                hardware = GetHardwareInfo(),
                operatingSystem = GetOsInfo(),
                network = GetNetworkInfo(),
                software = GetSoftwareInfo(),
                security = GetSecurityInfo(),
                agent = GetAgentInfo()
            };

            var response = await _client.PostAsync<object>("/inventory/submit", inventory, cancellationToken);

            if (response.IsSuccess)
            {
                _logger.Information("Inventory submitted successfully");
            }
            else
            {
                _logger.Error("Inventory submission failed: {Error}", response.ErrorMessage);
            }
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Inventory collection error");
            throw; // Re-throw to allow command executor to handle error
        }
    }

    private object GetHardwareInfo()
    {
        try
        {
            var hardware = new Dictionary<string, object>();

            // CPU
            using var cpuSearcher = new ManagementObjectSearcher("SELECT Name, NumberOfCores, MaxClockSpeed FROM Win32_Processor");
            foreach (var cpu in cpuSearcher.Get())
            {
                hardware["manufacturer"] = "Intel/AMD"; // Simplified
                hardware["model"] = cpu["Name"]?.ToString();
                hardware["cpu"] = cpu["Name"]?.ToString();
                hardware["cpuCores"] = Convert.ToInt32(cpu["NumberOfCores"]);
                break;
            }

            // RAM
            hardware["ram"] = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes / (1024 * 1024 * 1024);

            // Storage
            using var diskSearcher = new ManagementObjectSearcher("SELECT Size, MediaType FROM Win32_DiskDrive");
            var totalStorage = 0L;
            foreach (var disk in diskSearcher.Get())
            {
                totalStorage += Convert.ToInt64(disk["Size"]);
            }
            hardware["storage"] = totalStorage / (1024 * 1024 * 1024);
            hardware["storageType"] = "SSD/HDD";

            // Manufacturer
            using var systemSearcher = new ManagementObjectSearcher("SELECT Manufacturer, Model FROM Win32_ComputerSystem");
            foreach (var system in systemSearcher.Get())
            {
                hardware["manufacturer"] = system["Manufacturer"]?.ToString();
                hardware["model"] = system["Model"]?.ToString();
                break;
            }

            // Serial Number
            using var biosSearcher = new ManagementObjectSearcher("SELECT SerialNumber FROM Win32_BIOS");
            foreach (var bios in biosSearcher.Get())
            {
                hardware["serialNumber"] = bios["SerialNumber"]?.ToString();
                break;
            }

            return hardware;
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Failed to get hardware info");
            return new Dictionary<string, object>();
        }
    }

    private object GetOsInfo()
    {
        try
        {
            return new
            {
                name = "Windows",
                version = Environment.OSVersion.VersionString,
                build = Environment.OSVersion.Version.Build.ToString(),
                architecture = Environment.Is64BitOperatingSystem ? "x64" : "x86"
            };
        }
        catch
        {
            return new { name = "Windows", version = "Unknown" };
        }
    }

    private object GetNetworkInfo()
    {
        try
        {
            var network = new Dictionary<string, object>();
            var interfaces = new List<object>();

            using var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled = True");
            foreach (var adapter in searcher.Get())
            {
                var mac = adapter["MACAddress"]?.ToString();
                var ips = adapter["IPAddress"] as string[];

                if (!string.IsNullOrEmpty(mac) && ips != null && ips.Length > 0)
                {
                    interfaces.Add(new
                    {
                        name = adapter["Description"]?.ToString(),
                        macAddress = mac,
                        ipAddress = ips[0]
                    });

                    network["macAddress"] = mac;
                    network["ipAddress"] = ips[0];
                    network["hostname"] = Environment.MachineName;
                }
            }

            network["networkInterfaces"] = interfaces;
            return network;
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Failed to get network info");
            return new Dictionary<string, object>();
        }
    }

    private object GetSoftwareInfo()
    {
        try
        {
            var software = new Dictionary<string, object>();
            var applications = new List<object>();

            using var searcher = new ManagementObjectSearcher("SELECT Name, Version, Publisher FROM Win32_Product");
            foreach (var product in searcher.Get())
            {
                applications.Add(new
                {
                    name = product["Name"]?.ToString(),
                    version = product["Version"]?.ToString(),
                    publisher = product["Publisher"]?.ToString()
                });
            }

            software["installedApplications"] = applications.Take(50).ToList(); // Limit to 50 apps
            return software;
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Failed to get software info");
            return new Dictionary<string, object>();
        }
    }

    private object GetSecurityInfo()
    {
        try
        {
            return new
            {
                antivirus = "Windows Defender", // Simplified
                firewallEnabled = true, // Simplified check
                encryptionEnabled = false // Would need BitLocker check
            };
        }
        catch
        {
            return new Dictionary<string, object>();
        }
    }

    private object GetAgentInfo()
    {
        return new
        {
            version = "0.1.0",
            installDate = DateTime.Now.ToString("o"),
            lastUpdate = DateTime.Now.ToString("o")
        };
    }
}
