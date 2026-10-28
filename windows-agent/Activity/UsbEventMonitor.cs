using System;
using System.Collections.Generic;
using System.Linq;
using System.Management;
using System.Text.RegularExpressions;
using Serilog;

namespace SentinelOpsAgent.Activity
{
    /// <summary>
    /// Monitors USB device connections and disconnections
    /// Detects unauthorized storage devices for DLP enforcement
    /// </summary>
    public class UsbEventMonitor : IDisposable
    {
        private readonly ILogger _logger;
        private ManagementEventWatcher _insertWatcher;
        private ManagementEventWatcher _removeWatcher;
        private bool _isMonitoring;
        private readonly object _lockObject = new object();
        private Dictionary<string, UsbDeviceInfo> _connectedDevices;

        public UsbEventMonitor()
        {
            _logger = Log.ForContext<UsbEventMonitor>();
            _connectedDevices = new Dictionary<string, UsbDeviceInfo>();
        }

        /// <summary>
        /// Start monitoring USB device events
        /// </summary>
        public void StartMonitoring(Action<UsbDeviceEvent> onUsbEvent)
        {
            lock (_lockObject)
            {
                if (_isMonitoring)
                {
                    _logger.Warning("USB event monitor is already running");
                    return;
                }

                try
                {
                    // Get initial connected devices
                    _connectedDevices = GetCurrentUsbDevices().ToDictionary(d => d.DeviceId, d => d);

                    // Monitor USB device insertion (EventType = 2)
                    _insertWatcher = new ManagementEventWatcher(
                        new WqlEventQuery("SELECT * FROM Win32_DeviceChangeEvent WHERE EventType = 2")
                    );

                    _insertWatcher.EventArrived += (sender, e) =>
                    {
                        try
                        {
                            _logger.Debug("USB device insertion detected");

                            // Query current USB devices
                            var currentDevices = GetCurrentUsbDevices();

                            // Find newly connected devices
                            foreach (var device in currentDevices)
                            {
                                if (!_connectedDevices.ContainsKey(device.DeviceId))
                                {
                                    _logger.Information(
                                        "USB device connected: {Name} ({DeviceId})",
                                        device.Name,
                                        device.DeviceId
                                    );

                                    _connectedDevices[device.DeviceId] = device;

                                    var usbEvent = new UsbDeviceEvent
                                    {
                                        EventType = "CONNECTED",
                                        DeviceInfo = device,
                                        DetectedAt = DateTime.UtcNow
                                    };

                                    onUsbEvent?.Invoke(usbEvent);
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.Error(ex, "Error processing USB insertion event");
                        }
                    };

                    // Monitor USB device removal (EventType = 3)
                    _removeWatcher = new ManagementEventWatcher(
                        new WqlEventQuery("SELECT * FROM Win32_DeviceChangeEvent WHERE EventType = 3")
                    );

                    _removeWatcher.EventArrived += (sender, e) =>
                    {
                        try
                        {
                            _logger.Debug("USB device removal detected");

                            // Query current USB devices
                            var currentDevices = GetCurrentUsbDevices();
                            var currentDeviceIds = new HashSet<string>(currentDevices.Select(d => d.DeviceId));

                            // Find disconnected devices
                            var disconnectedDevices = _connectedDevices.Values
                                .Where(d => !currentDeviceIds.Contains(d.DeviceId))
                                .ToList();

                            foreach (var device in disconnectedDevices)
                            {
                                _logger.Information(
                                    "USB device disconnected: {Name} ({DeviceId})",
                                    device.Name,
                                    device.DeviceId
                                );

                                _connectedDevices.Remove(device.DeviceId);

                                var usbEvent = new UsbDeviceEvent
                                {
                                    EventType = "DISCONNECTED",
                                    DeviceInfo = device,
                                    DetectedAt = DateTime.UtcNow
                                };

                                onUsbEvent?.Invoke(usbEvent);
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.Error(ex, "Error processing USB removal event");
                        }
                    };

                    _insertWatcher.Start();
                    _removeWatcher.Start();
                    _isMonitoring = true;

                    _logger.Information(
                        "USB event monitor started - {Count} devices currently connected",
                        _connectedDevices.Count
                    );
                }
                catch (Exception ex)
                {
                    _logger.Error(ex, "Failed to start USB event monitor");
                    throw;
                }
            }
        }

        /// <summary>
        /// Stop monitoring USB device events
        /// </summary>
        public void StopMonitoring()
        {
            lock (_lockObject)
            {
                if (!_isMonitoring)
                {
                    return;
                }

                try
                {
                    _insertWatcher?.Stop();
                    _insertWatcher?.Dispose();
                    _insertWatcher = null;

                    _removeWatcher?.Stop();
                    _removeWatcher?.Dispose();
                    _removeWatcher = null;

                    _isMonitoring = false;

                    _logger.Information("USB event monitor stopped");
                }
                catch (Exception ex)
                {
                    _logger.Error(ex, "Error stopping USB event monitor");
                }
            }
        }

        /// <summary>
        /// Get currently connected USB devices
        /// </summary>
        public List<UsbDeviceInfo> GetCurrentUsbDevices()
        {
            var devices = new List<UsbDeviceInfo>();

            try
            {
                using var searcher = new ManagementObjectSearcher(
                    "SELECT * FROM Win32_PnPEntity WHERE DeviceID LIKE 'USB%'"
                );

                foreach (ManagementObject obj in searcher.Get())
                {
                    try
                    {
                        var deviceInfo = ParseUsbDevice(obj);
                        if (deviceInfo != null)
                        {
                            devices.Add(deviceInfo);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.Debug(ex, "Error parsing USB device");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error querying USB devices");
            }

            return devices;
        }

        /// <summary>
        /// Parse Win32_PnPEntity into UsbDeviceInfo
        /// </summary>
        private UsbDeviceInfo ParseUsbDevice(ManagementObject obj)
        {
            var deviceId = obj["DeviceID"]?.ToString();
            if (string.IsNullOrEmpty(deviceId))
            {
                return null;
            }

            var name = obj["Name"]?.ToString() ?? "Unknown USB Device";
            var description = obj["Description"]?.ToString() ?? "";
            var manufacturer = obj["Manufacturer"]?.ToString() ?? "Unknown";
            var status = obj["Status"]?.ToString() ?? "Unknown";

            // Extract VID (Vendor ID) and PID (Product ID) from DeviceID
            // Format: USB\VID_XXXX&PID_YYYY\SerialNumber
            var vendorId = ExtractVendorId(deviceId);
            var productId = ExtractProductId(deviceId);
            var serialNumber = ExtractSerialNumber(deviceId);

            // Determine device type based on device class and name
            var deviceType = DetermineDeviceType(obj, name, description);

            return new UsbDeviceInfo
            {
                Name = name,
                DeviceId = deviceId,
                Description = description,
                Manufacturer = manufacturer,
                VendorId = vendorId,
                ProductId = productId,
                SerialNumber = serialNumber,
                DeviceType = deviceType,
                Status = status
            };
        }

        /// <summary>
        /// Extract Vendor ID from USB Device ID
        /// </summary>
        private string ExtractVendorId(string deviceId)
        {
            var match = Regex.Match(deviceId, @"VID_([0-9A-Fa-f]{4})", RegexOptions.IgnoreCase);
            return match.Success ? match.Groups[1].Value.ToUpper() : "Unknown";
        }

        /// <summary>
        /// Extract Product ID from USB Device ID
        /// </summary>
        private string ExtractProductId(string deviceId)
        {
            var match = Regex.Match(deviceId, @"PID_([0-9A-Fa-f]{4})", RegexOptions.IgnoreCase);
            return match.Success ? match.Groups[1].Value.ToUpper() : "Unknown";
        }

        /// <summary>
        /// Extract Serial Number from USB Device ID
        /// </summary>
        private string ExtractSerialNumber(string deviceId)
        {
            // Serial number is after the second backslash
            var parts = deviceId.Split('\\');
            return parts.Length > 2 ? parts[2] : "Unknown";
        }

        /// <summary>
        /// Determine USB device type
        /// </summary>
        private string DetermineDeviceType(ManagementObject obj, string name, string description)
        {
            var nameLower = name.ToLower();
            var descLower = description.ToLower();

            // Check device class
            var classGuid = obj["ClassGuid"]?.ToString() ?? "";

            // USB Storage devices
            if (classGuid == "{36fc9e60-c465-11cf-8056-444553540000}" || // USB Storage
                nameLower.Contains("disk drive") ||
                nameLower.Contains("storage") ||
                nameLower.Contains("flash") ||
                nameLower.Contains("thumb") ||
                descLower.Contains("mass storage"))
            {
                return "STORAGE";
            }

            // HID devices (keyboard, mouse)
            if (classGuid == "{745a17a0-74d3-11d0-b6fe-00a0c90f57da}" || // HID
                nameLower.Contains("keyboard") ||
                nameLower.Contains("mouse") ||
                nameLower.Contains("hid"))
            {
                if (nameLower.Contains("keyboard"))
                    return "KEYBOARD";
                if (nameLower.Contains("mouse"))
                    return "MOUSE";
                return "HID";
            }

            // Printers
            if (classGuid == "{4d36e979-e325-11ce-bfc1-08002be10318}" || // Printer
                nameLower.Contains("printer"))
            {
                return "PRINTER";
            }

            // Webcams
            if (classGuid == "{ca3e7ab9-b4c3-4ae6-8251-579ef933890f}" || // Camera
                nameLower.Contains("camera") ||
                nameLower.Contains("webcam"))
            {
                return "CAMERA";
            }

            // Audio devices
            if (nameLower.Contains("audio") ||
                nameLower.Contains("speaker") ||
                nameLower.Contains("headset") ||
                nameLower.Contains("microphone"))
            {
                return "AUDIO";
            }

            // Network adapters
            if (classGuid == "{4d36e972-e325-11ce-bfc1-08002be10318}" || // Network
                nameLower.Contains("network") ||
                nameLower.Contains("ethernet") ||
                nameLower.Contains("wifi"))
            {
                return "NETWORK";
            }

            // Serial/COM devices
            if (nameLower.Contains("serial") ||
                nameLower.Contains("com port"))
            {
                return "SERIAL";
            }

            return "UNKNOWN";
        }

        public void Dispose()
        {
            StopMonitoring();
        }
    }

    /// <summary>
    /// USB device information
    /// </summary>
    public class UsbDeviceInfo
    {
        public string Name { get; set; }
        public string DeviceId { get; set; }
        public string Description { get; set; }
        public string Manufacturer { get; set; }
        public string VendorId { get; set; }
        public string ProductId { get; set; }
        public string SerialNumber { get; set; }
        public string DeviceType { get; set; }
        public string Status { get; set; }
    }

    /// <summary>
    /// USB device event (connection or disconnection)
    /// </summary>
    public class UsbDeviceEvent
    {
        public string EventType { get; set; } // CONNECTED or DISCONNECTED
        public UsbDeviceInfo DeviceInfo { get; set; }
        public DateTime DetectedAt { get; set; }
    }
}
