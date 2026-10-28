using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Serilog;
using Windows.Devices.Bluetooth;
using Windows.Devices.Bluetooth.Advertisement;
using Windows.Devices.Enumeration;

namespace SentinelOpsAgent.Activity;

/// <summary>
/// Bluetooth Device Scanner
/// 
/// Scans for nearby Bluetooth devices using Windows.Devices.Bluetooth API.
/// Captures device details including name, address, type, class, RSSI,
/// paired status, and last seen timestamp.
/// 
/// Security Use Cases:
/// - Unauthorized Bluetooth device detection
/// - Rogue device monitoring (BlueBorne, BlueBugs attacks)
/// - Data exfiltration via Bluetooth (file transfers)
/// - Bluetooth beacon tracking (privacy concerns)
/// - Compliance verification (Bluetooth disabled in secure zones)
/// 
/// Performance:
/// - Scan duration: 10 seconds (configurable)
/// - Memory: ~3-5 MB during scan
/// - CPU: < 1% (async event-driven)
/// 
/// Limitations:
/// - Requires Bluetooth adapter present
/// - May require elevated privileges on some systems
/// - Range limited to ~10-100 meters (depends on Bluetooth class)
/// - Only detects discoverable devices (hidden devices not visible)
/// </summary>
public class BluetoothScanner : IDisposable
{
    private readonly ILogger _logger;
    private BluetoothLEAdvertisementWatcher? _bleWatcher;
    private readonly Dictionary<ulong, BluetoothDevice> _discoveredDevices;
    private bool _disposed = false;

    public BluetoothScanner(ILogger? logger = null)
    {
        _logger = logger ?? Log.Logger;
        _discoveredDevices = new Dictionary<ulong, BluetoothDevice>();
    }

    /// <summary>
    /// Scan for Bluetooth and Bluetooth LE devices
    /// </summary>
    /// <param name="scanDurationSeconds">Duration to scan in seconds (default: 10)</param>
    /// <returns>List of discovered Bluetooth devices</returns>
    public async Task<List<BluetoothDevice>> ScanDevicesAsync(int scanDurationSeconds = 10)
    {
        var devices = new List<BluetoothDevice>();

        try
        {
            _discoveredDevices.Clear();

            // Start BLE advertisement watcher (for Bluetooth LE devices)
            var bleTask = ScanBluetoothLEDevicesAsync(scanDurationSeconds);

            // Scan classic Bluetooth devices
            var classicTask = ScanClassicBluetoothDevicesAsync();

            // Wait for both scans to complete
            await Task.WhenAll(bleTask, classicTask);

            devices.AddRange(_discoveredDevices.Values);

            _logger.Information("Bluetooth scan completed: {Count} devices discovered", devices.Count);
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Bluetooth scan failed");
        }

        return devices;
    }

    /// <summary>
    /// Scan for Bluetooth LE devices using Advertisement Watcher
    /// </summary>
    private async Task ScanBluetoothLEDevicesAsync(int durationSeconds)
    {
        try
        {
            _bleWatcher = new BluetoothLEAdvertisementWatcher
            {
                ScanningMode = BluetoothLEScanningMode.Active
            };

            _bleWatcher.Received += OnBleAdvertisementReceived;

            _bleWatcher.Start();
            _logger.Debug("BLE advertisement watcher started");

            // Scan for specified duration
            await Task.Delay(TimeSpan.FromSeconds(durationSeconds));

            _bleWatcher.Stop();
            _bleWatcher.Received -= OnBleAdvertisementReceived;
            _logger.Debug("BLE advertisement watcher stopped");
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "BLE scan failed");
        }
    }

    /// <summary>
    /// Scan for classic Bluetooth devices using Device Enumeration API
    /// </summary>
    private async Task ScanClassicBluetoothDevicesAsync()
    {
        try
        {
            // Query for all Bluetooth devices (classic + LE)
            var selector = BluetoothDevice.GetDeviceSelector();
            var deviceInfoCollection = await DeviceInformation.FindAllAsync(selector);

            foreach (var deviceInfo in deviceInfoCollection)
            {
                try
                {
                    var btDevice = await BluetoothDevice.FromIdAsync(deviceInfo.Id);
                    if (btDevice != null)
                    {
                        var device = new BluetoothDevice
                        {
                            Name = string.IsNullOrWhiteSpace(btDevice.Name) ? "Unknown Device" : btDevice.Name,
                            Address = FormatBluetoothAddress(btDevice.BluetoothAddress),
                            DeviceId = deviceInfo.Id,
                            IsPaired = deviceInfo.Pairing.IsPaired,
                            IsConnected = btDevice.ConnectionStatus == BluetoothConnectionStatus.Connected,
                            DeviceType = "Classic",
                            ClassOfDevice = GetClassOfDevice(btDevice.ClassOfDevice),
                            LastSeen = DateTime.UtcNow,
                            Rssi = null, // RSSI not available for classic Bluetooth via this API
                            DetectedAt = DateTime.UtcNow
                        };

                        _discoveredDevices[btDevice.BluetoothAddress] = device;

                        btDevice.Dispose();
                    }
                }
                catch (Exception ex)
                {
                    _logger.Debug(ex, "Failed to get Bluetooth device details for {DeviceId}", deviceInfo.Id);
                }
            }

            _logger.Debug("Classic Bluetooth scan completed: {Count} devices found", deviceInfoCollection.Count);
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Classic Bluetooth scan failed");
        }
    }

    /// <summary>
    /// Handle BLE advertisement received event
    /// </summary>
    private void OnBleAdvertisementReceived(BluetoothLEAdvertisementWatcher watcher, BluetoothLEAdvertisementReceivedEventArgs args)
    {
        try
        {
            var address = args.BluetoothAddress;

            // Update or add device
            if (!_discoveredDevices.ContainsKey(address))
            {
                var device = new BluetoothDevice
                {
                    Name = string.IsNullOrWhiteSpace(args.Advertisement.LocalName) ? "Unknown BLE Device" : args.Advertisement.LocalName,
                    Address = FormatBluetoothAddress(address),
                    DeviceId = null,
                    IsPaired = false, // BLE advertisement doesn't provide pairing info
                    IsConnected = false,
                    DeviceType = "BLE",
                    ClassOfDevice = null,
                    LastSeen = DateTime.UtcNow,
                    Rssi = args.RawSignalStrengthInDBm,
                    DetectedAt = DateTime.UtcNow
                };

                _discoveredDevices[address] = device;
            }
            else
            {
                // Update RSSI and last seen for existing device
                _discoveredDevices[address].Rssi = args.RawSignalStrengthInDBm;
                _discoveredDevices[address].LastSeen = DateTime.UtcNow;
            }
        }
        catch (Exception ex)
        {
            _logger.Debug(ex, "Failed to process BLE advertisement");
        }
    }

    /// <summary>
    /// Format Bluetooth address from ulong to MAC address string
    /// </summary>
    private string FormatBluetoothAddress(ulong address)
    {
        var bytes = BitConverter.GetBytes(address);
        Array.Reverse(bytes); // Big-endian
        return BitConverter.ToString(bytes, 2, 6).Replace("-", ":");
    }

    /// <summary>
    /// Get human-readable Class of Device description
    /// </summary>
    private string? GetClassOfDevice(BluetoothClassOfDevice? cod)
    {
        if (cod == null) return null;

        try
        {
            var majorClass = cod.MajorClass;
            var minorClass = cod.MinorClass;

            // Decode major device class
            string deviceCategory = majorClass switch
            {
                BluetoothMajorClass.Miscellaneous => "Miscellaneous",
                BluetoothMajorClass.Computer => "Computer",
                BluetoothMajorClass.Phone => "Phone",
                BluetoothMajorClass.NetworkAccessPoint => "Network Access Point",
                BluetoothMajorClass.AudioVideo => GetAudioVideoMinorClass(minorClass),
                BluetoothMajorClass.Peripheral => "Peripheral",
                BluetoothMajorClass.Imaging => "Imaging",
                BluetoothMajorClass.Wearable => "Wearable",
                BluetoothMajorClass.Toy => "Toy",
                BluetoothMajorClass.Health => "Health Device",
                _ => $"Unknown ({(int)majorClass})"
            };

            return deviceCategory;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Get detailed Audio/Video device type
    /// </summary>
    private string GetAudioVideoMinorClass(BluetoothMinorClass minorClass)
    {
        return minorClass switch
        {
            BluetoothMinorClass.AudioVideoWearableHeadset => "Audio/Video - Headset",
            BluetoothMinorClass.AudioVideoHandsFree => "Audio/Video - Hands-Free",
            BluetoothMinorClass.AudioVideoMicrophone => "Audio/Video - Microphone",
            BluetoothMinorClass.AudioVideoLoudspeaker => "Audio/Video - Speaker",
            BluetoothMinorClass.AudioVideoHeadphones => "Audio/Video - Headphones",
            BluetoothMinorClass.AudioVideoPortableAudio => "Audio/Video - Portable Audio",
            BluetoothMinorClass.AudioVideoCarAudio => "Audio/Video - Car Audio",
            BluetoothMinorClass.AudioVideoSetTopBox => "Audio/Video - Set-Top Box",
            BluetoothMinorClass.AudioVideoHifiAudioDevice => "Audio/Video - Hi-Fi Audio",
            BluetoothMinorClass.AudioVideoVcr => "Audio/Video - VCR",
            BluetoothMinorClass.AudioVideoVideoCamera => "Audio/Video - Camera",
            BluetoothMinorClass.AudioVideoCamcorder => "Audio/Video - Camcorder",
            BluetoothMinorClass.AudioVideoVideoMonitor => "Audio/Video - Monitor",
            BluetoothMinorClass.AudioVideoVideoDisplayAndLoudspeaker => "Audio/Video - Display+Speaker",
            BluetoothMinorClass.AudioVideoVideoConferencing => "Audio/Video - Conferencing",
            BluetoothMinorClass.AudioVideoGamingOrToy => "Audio/Video - Gaming/Toy",
            _ => "Audio/Video"
        };
    }

    /// <summary>
    /// Get currently paired Bluetooth devices
    /// </summary>
    public async Task<List<BluetoothDevice>> GetPairedDevicesAsync()
    {
        var devices = new List<BluetoothDevice>();

        try
        {
            var selector = BluetoothDevice.GetDeviceSelector();
            var deviceInfoCollection = await DeviceInformation.FindAllAsync(selector);

            foreach (var deviceInfo in deviceInfoCollection.Where(d => d.Pairing.IsPaired))
            {
                try
                {
                    var btDevice = await BluetoothDevice.FromIdAsync(deviceInfo.Id);
                    if (btDevice != null)
                    {
                        var device = new BluetoothDevice
                        {
                            Name = string.IsNullOrWhiteSpace(btDevice.Name) ? "Unknown Device" : btDevice.Name,
                            Address = FormatBluetoothAddress(btDevice.BluetoothAddress),
                            DeviceId = deviceInfo.Id,
                            IsPaired = true,
                            IsConnected = btDevice.ConnectionStatus == BluetoothConnectionStatus.Connected,
                            DeviceType = "Classic",
                            ClassOfDevice = GetClassOfDevice(btDevice.ClassOfDevice),
                            LastSeen = DateTime.UtcNow,
                            DetectedAt = DateTime.UtcNow
                        };

                        devices.Add(device);
                        btDevice.Dispose();
                    }
                }
                catch (Exception ex)
                {
                    _logger.Debug(ex, "Failed to get paired device details for {DeviceId}", deviceInfo.Id);
                }
            }

            _logger.Debug("Found {Count} paired Bluetooth devices", devices.Count);
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Failed to get paired Bluetooth devices");
        }

        return devices;
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            if (_bleWatcher != null)
            {
                if (_bleWatcher.Status == BluetoothLEAdvertisementWatcherStatus.Started)
                {
                    _bleWatcher.Stop();
                }
                _bleWatcher.Received -= OnBleAdvertisementReceived;
                _bleWatcher = null;
            }

            _discoveredDevices.Clear();
            _disposed = true;
        }
    }
}

/// <summary>
/// Represents a discovered Bluetooth device
/// </summary>
public class BluetoothDevice
{
    /// <summary>
    /// Device name (friendly name)
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Bluetooth MAC address in format "AA:BB:CC:DD:EE:FF"
    /// </summary>
    public string Address { get; set; } = string.Empty;

    /// <summary>
    /// Windows device ID (null for BLE advertisement-only devices)
    /// </summary>
    public string? DeviceId { get; set; }

    /// <summary>
    /// Device type: "Classic" or "BLE"
    /// </summary>
    public string DeviceType { get; set; } = string.Empty;

    /// <summary>
    /// Class of Device (COD) description
    /// Examples: "Phone", "Computer", "Audio/Video - Headset"
    /// </summary>
    public string? ClassOfDevice { get; set; }

    /// <summary>
    /// Whether device is paired with this computer
    /// </summary>
    public bool IsPaired { get; set; }

    /// <summary>
    /// Whether device is currently connected
    /// </summary>
    public bool IsConnected { get; set; }

    /// <summary>
    /// RSSI (Received Signal Strength Indicator) in dBm
    /// Available for BLE devices, null for classic Bluetooth
    /// </summary>
    public short? Rssi { get; set; }

    /// <summary>
    /// Last time device was seen (updated during scan)
    /// </summary>
    public DateTime LastSeen { get; set; }

    /// <summary>
    /// Timestamp when device was first detected in this scan
    /// </summary>
    public DateTime DetectedAt { get; set; }
}
