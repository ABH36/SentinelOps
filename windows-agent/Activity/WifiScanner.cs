using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using Serilog;

namespace SentinelOpsAgent.Activity;

/// <summary>
/// Wi-Fi Network Scanner
/// 
/// Scans for available Wi-Fi networks using Native WiFi API (wlanapi.dll).
/// Captures network details including SSID, BSSID, signal strength, security type,
/// channel information, and connection status.
/// 
/// Security Use Cases:
/// - Rogue AP detection (unauthorized wireless access points)
/// - Evil twin detection (fake APs mimicking legitimate networks)
/// - Open/weak security detection (WEP, open networks)
/// - Network reconnaissance monitoring
/// - Compliance verification (approved networks only)
/// 
/// Performance:
/// - Scan duration: 1-3 seconds (depends on adapter and environment)
/// - Memory: ~2-5 MB during scan
/// - CPU: < 1% (native API call)
/// 
/// Limitations:
/// - Requires Wi-Fi adapter present
/// - May require elevated privileges on some systems
/// - Scan results depend on physical location and RF environment
/// </summary>
public class WifiScanner : IDisposable
{
    private readonly ILogger _logger;
    private IntPtr _clientHandle = IntPtr.Zero;
    private bool _disposed = false;

    // Native WiFi API constants
    private const uint WLAN_CLIENT_VERSION_VISTA = 2;
    private const uint ERROR_SUCCESS = 0;

    public WifiScanner(ILogger? logger = null)
    {
        _logger = logger ?? Log.Logger;
    }

    /// <summary>
    /// Scan for available Wi-Fi networks
    /// </summary>
    /// <returns>List of discovered Wi-Fi networks</returns>
    public List<WifiNetwork> ScanNetworks()
    {
        var networks = new List<WifiNetwork>();

        try
        {
            // Open WLAN client handle
            uint negotiatedVersion;
            var result = WlanOpenHandle(WLAN_CLIENT_VERSION_VISTA, IntPtr.Zero, out negotiatedVersion, out _clientHandle);

            if (result != ERROR_SUCCESS)
            {
                _logger.Warning("Failed to open WLAN handle: Error code {Code}", result);
                return networks;
            }

            // Enumerate WLAN interfaces
            IntPtr interfaceListPtr;
            result = WlanEnumInterfaces(_clientHandle, IntPtr.Zero, out interfaceListPtr);

            if (result != ERROR_SUCCESS)
            {
                _logger.Warning("Failed to enumerate WLAN interfaces: Error code {Code}", result);
                return networks;
            }

            try
            {
                var interfaceList = Marshal.PtrToStructure<WLAN_INTERFACE_INFO_LIST>(interfaceListPtr);
                var interfaceInfoSize = Marshal.SizeOf<WLAN_INTERFACE_INFO>();

                for (int i = 0; i < interfaceList.dwNumberOfItems; i++)
                {
                    var interfacePtr = new IntPtr(interfaceListPtr.ToInt64() + 8 + (i * interfaceInfoSize));
                    var interfaceInfo = Marshal.PtrToStructure<WLAN_INTERFACE_INFO>(interfacePtr);

                    // Scan for networks on this interface
                    var interfaceNetworks = ScanInterface(interfaceInfo.InterfaceGuid);
                    networks.AddRange(interfaceNetworks);
                }
            }
            finally
            {
                WlanFreeMemory(interfaceListPtr);
            }
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Wi-Fi scan failed");
        }

        return networks;
    }

    /// <summary>
    /// Scan networks on a specific WLAN interface
    /// </summary>
    private List<WifiNetwork> ScanInterface(Guid interfaceGuid)
    {
        var networks = new List<WifiNetwork>();

        try
        {
            // Trigger scan
            var result = WlanScan(_clientHandle, ref interfaceGuid, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);

            if (result != ERROR_SUCCESS)
            {
                _logger.Debug("WLAN scan failed on interface {Guid}: Error {Code}", interfaceGuid, result);
                // Don't return early - try to get cached results anyway
            }

            // Wait for scan to complete (typically 1-2 seconds)
            System.Threading.Thread.Sleep(2000);

            // Get available network list
            IntPtr availableNetworkListPtr;
            result = WlanGetAvailableNetworkList(
                _clientHandle,
                ref interfaceGuid,
                0, // dwFlags (0 = all networks)
                IntPtr.Zero,
                out availableNetworkListPtr);

            if (result != ERROR_SUCCESS)
            {
                _logger.Debug("Failed to get network list on interface {Guid}: Error {Code}", interfaceGuid, result);
                return networks;
            }

            try
            {
                var networkList = Marshal.PtrToStructure<WLAN_AVAILABLE_NETWORK_LIST>(availableNetworkListPtr);
                var networkSize = Marshal.SizeOf<WLAN_AVAILABLE_NETWORK>();

                for (int i = 0; i < networkList.dwNumberOfItems; i++)
                {
                    var networkPtr = new IntPtr(availableNetworkListPtr.ToInt64() + 8 + (i * networkSize));
                    var network = Marshal.PtrToStructure<WLAN_AVAILABLE_NETWORK>(networkPtr);

                    var wifiNetwork = new WifiNetwork
                    {
                        Ssid = Encoding.UTF8.GetString(network.dot11Ssid.ucSSID, 0, (int)network.dot11Ssid.uSSIDLength),
                        Bssid = null, // Not available from WLAN_AVAILABLE_NETWORK (would need BSS list)
                        SignalQuality = (int)network.wlanSignalQuality,
                        Channel = GetChannelFromFrequency(0), // Frequency not in WLAN_AVAILABLE_NETWORK
                        SecurityType = GetSecurityType(network.dot11DefaultAuthAlgorithm, network.dot11DefaultCipherAlgorithm),
                        IsConnected = network.dwFlags.HasFlag(WLAN_AVAILABLE_NETWORK_FLAGS.WLAN_AVAILABLE_NETWORK_CONNECTED),
                        NetworkType = network.dot11BssType.ToString(),
                        DetectedAt = DateTime.UtcNow
                    };

                    // Get BSS list for detailed info (BSSID, channel, frequency)
                    try
                    {
                        IntPtr bssListPtr;
                        var bssResult = WlanGetNetworkBssList(
                            _clientHandle,
                            ref interfaceGuid,
                            ref network.dot11Ssid,
                            network.dot11BssType,
                            network.bSecurityEnabled,
                            IntPtr.Zero,
                            out bssListPtr);

                        if (bssResult == ERROR_SUCCESS)
                        {
                            try
                            {
                                var bssList = Marshal.PtrToStructure<WLAN_BSS_LIST>(bssListPtr);
                                if (bssList.dwNumberOfItems > 0)
                                {
                                    var bssEntryPtr = new IntPtr(bssListPtr.ToInt64() + 8);
                                    var bssEntry = Marshal.PtrToStructure<WLAN_BSS_ENTRY>(bssEntryPtr);

                                    wifiNetwork.Bssid = BitConverter.ToString(bssEntry.dot11Bssid).Replace("-", ":");
                                    wifiNetwork.Channel = GetChannelFromFrequency((int)bssEntry.ulChCenterFrequency);
                                    wifiNetwork.Frequency = (int)bssEntry.ulChCenterFrequency;
                                    wifiNetwork.Rssi = bssEntry.lRssi;
                                }
                            }
                            finally
                            {
                                WlanFreeMemory(bssListPtr);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.Debug(ex, "Failed to get BSS list for network {SSID}", wifiNetwork.Ssid);
                    }

                    networks.Add(wifiNetwork);
                }
            }
            finally
            {
                WlanFreeMemory(availableNetworkListPtr);
            }
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Failed to scan interface {Guid}", interfaceGuid);
        }

        return networks;
    }

    /// <summary>
    /// Get Wi-Fi channel from frequency (kHz)
    /// </summary>
    private int GetChannelFromFrequency(int frequencyKhz)
    {
        if (frequencyKhz == 0) return 0;

        // 2.4 GHz band (802.11b/g/n)
        if (frequencyKhz >= 2412000 && frequencyKhz <= 2484000)
        {
            if (frequencyKhz == 2484000) return 14; // Japan only
            return (frequencyKhz - 2407000) / 5000;
        }

        // 5 GHz band (802.11a/n/ac)
        if (frequencyKhz >= 5170000 && frequencyKhz <= 5825000)
        {
            return (frequencyKhz - 5000000) / 5000;
        }

        return 0;
    }

    /// <summary>
    /// Get security type string from authentication and cipher algorithms
    /// </summary>
    private string GetSecurityType(DOT11_AUTH_ALGORITHM authAlg, DOT11_CIPHER_ALGORITHM cipherAlg)
    {
        switch (authAlg)
        {
            case DOT11_AUTH_ALGORITHM.DOT11_AUTH_ALGO_80211_OPEN:
                return cipherAlg == DOT11_CIPHER_ALGORITHM.DOT11_CIPHER_ALGO_NONE ? "Open" : "WEP";
            
            case DOT11_AUTH_ALGORITHM.DOT11_AUTH_ALGO_80211_SHARED_KEY:
                return "WEP";
            
            case DOT11_AUTH_ALGORITHM.DOT11_AUTH_ALGO_WPA:
                return "WPA";
            
            case DOT11_AUTH_ALGORITHM.DOT11_AUTH_ALGO_WPA_PSK:
                return "WPA-PSK";
            
            case DOT11_AUTH_ALGORITHM.DOT11_AUTH_ALGO_WPA_NONE:
                return "WPA-None";
            
            case DOT11_AUTH_ALGORITHM.DOT11_AUTH_ALGO_RSNA:
                return cipherAlg == DOT11_CIPHER_ALGORITHM.DOT11_CIPHER_ALGO_CCMP ? "WPA2" : "WPA2-Enterprise";
            
            case DOT11_AUTH_ALGORITHM.DOT11_AUTH_ALGO_RSNA_PSK:
                return "WPA2-PSK";
            
            case DOT11_AUTH_ALGORITHM.DOT11_AUTH_ALGO_WPA3:
                return "WPA3";
            
            case DOT11_AUTH_ALGORITHM.DOT11_AUTH_ALGO_WPA3_SAE:
                return "WPA3-SAE";
            
            default:
                return "Unknown";
        }
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            if (_clientHandle != IntPtr.Zero)
            {
                WlanCloseHandle(_clientHandle, IntPtr.Zero);
                _clientHandle = IntPtr.Zero;
            }
            _disposed = true;
        }
    }

    #region Native WiFi API P/Invoke

    [DllImport("wlanapi.dll", SetLastError = true)]
    private static extern uint WlanOpenHandle(
        uint dwClientVersion,
        IntPtr pReserved,
        out uint pdwNegotiatedVersion,
        out IntPtr phClientHandle);

    [DllImport("wlanapi.dll", SetLastError = true)]
    private static extern uint WlanCloseHandle(
        IntPtr hClientHandle,
        IntPtr pReserved);

    [DllImport("wlanapi.dll", SetLastError = true)]
    private static extern uint WlanEnumInterfaces(
        IntPtr hClientHandle,
        IntPtr pReserved,
        out IntPtr ppInterfaceList);

    [DllImport("wlanapi.dll", SetLastError = true)]
    private static extern uint WlanScan(
        IntPtr hClientHandle,
        ref Guid pInterfaceGuid,
        IntPtr pDot11Ssid,
        IntPtr pIeData,
        IntPtr pReserved);

    [DllImport("wlanapi.dll", SetLastError = true)]
    private static extern uint WlanGetAvailableNetworkList(
        IntPtr hClientHandle,
        ref Guid pInterfaceGuid,
        uint dwFlags,
        IntPtr pReserved,
        out IntPtr ppAvailableNetworkList);

    [DllImport("wlanapi.dll", SetLastError = true)]
    private static extern uint WlanGetNetworkBssList(
        IntPtr hClientHandle,
        ref Guid pInterfaceGuid,
        ref DOT11_SSID pDot11Ssid,
        DOT11_BSS_TYPE dot11BssType,
        bool bSecurityEnabled,
        IntPtr pReserved,
        out IntPtr ppWlanBssList);

    [DllImport("wlanapi.dll", SetLastError = true)]
    private static extern void WlanFreeMemory(IntPtr pMemory);

    #endregion

    #region Native WiFi Structures

    [StructLayout(LayoutKind.Sequential)]
    private struct WLAN_INTERFACE_INFO_LIST
    {
        public uint dwNumberOfItems;
        public uint dwIndex;
        // Followed by WLAN_INTERFACE_INFO structures
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WLAN_INTERFACE_INFO
    {
        public Guid InterfaceGuid;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string strInterfaceDescription;
        public WLAN_INTERFACE_STATE isState;
    }

    private enum WLAN_INTERFACE_STATE
    {
        wlan_interface_state_not_ready = 0,
        wlan_interface_state_connected = 1,
        wlan_interface_state_ad_hoc_network_formed = 2,
        wlan_interface_state_disconnecting = 3,
        wlan_interface_state_disconnected = 4,
        wlan_interface_state_associating = 5,
        wlan_interface_state_discovering = 6,
        wlan_interface_state_authenticating = 7
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WLAN_AVAILABLE_NETWORK_LIST
    {
        public uint dwNumberOfItems;
        public uint dwIndex;
        // Followed by WLAN_AVAILABLE_NETWORK structures
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WLAN_AVAILABLE_NETWORK
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string strProfileName;
        public DOT11_SSID dot11Ssid;
        public DOT11_BSS_TYPE dot11BssType;
        public uint uNumberOfBssids;
        public bool bNetworkConnectable;
        public uint wlanNotConnectableReason;
        public uint uNumberOfPhyTypes;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 8)]
        public DOT11_PHY_TYPE[] dot11PhyTypes;
        public bool bMorePhyTypes;
        public uint wlanSignalQuality;
        public bool bSecurityEnabled;
        public DOT11_AUTH_ALGORITHM dot11DefaultAuthAlgorithm;
        public DOT11_CIPHER_ALGORITHM dot11DefaultCipherAlgorithm;
        public WLAN_AVAILABLE_NETWORK_FLAGS dwFlags;
        public uint dwReserved;
    }

    [Flags]
    private enum WLAN_AVAILABLE_NETWORK_FLAGS : uint
    {
        WLAN_AVAILABLE_NETWORK_CONNECTED = 0x00000001,
        WLAN_AVAILABLE_NETWORK_HAS_PROFILE = 0x00000002
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DOT11_SSID
    {
        public uint uSSIDLength;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
        public byte[] ucSSID;
    }

    private enum DOT11_BSS_TYPE
    {
        dot11_BSS_type_infrastructure = 1,
        dot11_BSS_type_independent = 2,
        dot11_BSS_type_any = 3
    }

    private enum DOT11_PHY_TYPE
    {
        dot11_phy_type_unknown = 0,
        dot11_phy_type_fhss = 1,
        dot11_phy_type_dsss = 2,
        dot11_phy_type_irbaseband = 3,
        dot11_phy_type_ofdm = 4,
        dot11_phy_type_hrdsss = 5,
        dot11_phy_type_erp = 6,
        dot11_phy_type_ht = 7,
        dot11_phy_type_vht = 8,
        dot11_phy_type_IHV_start = 0x80000000,
        dot11_phy_type_IHV_end = 0xffffffff
    }

    private enum DOT11_AUTH_ALGORITHM
    {
        DOT11_AUTH_ALGO_80211_OPEN = 1,
        DOT11_AUTH_ALGO_80211_SHARED_KEY = 2,
        DOT11_AUTH_ALGO_WPA = 3,
        DOT11_AUTH_ALGO_WPA_PSK = 4,
        DOT11_AUTH_ALGO_WPA_NONE = 5,
        DOT11_AUTH_ALGO_RSNA = 6,
        DOT11_AUTH_ALGO_RSNA_PSK = 7,
        DOT11_AUTH_ALGO_WPA3 = 8,
        DOT11_AUTH_ALGO_WPA3_SAE = 9,
        DOT11_AUTH_ALGO_IHV_START = 0x80000000,
        DOT11_AUTH_ALGO_IHV_END = 0xffffffff
    }

    private enum DOT11_CIPHER_ALGORITHM
    {
        DOT11_CIPHER_ALGO_NONE = 0x00,
        DOT11_CIPHER_ALGO_WEP40 = 0x01,
        DOT11_CIPHER_ALGO_TKIP = 0x02,
        DOT11_CIPHER_ALGO_CCMP = 0x04,
        DOT11_CIPHER_ALGO_WEP104 = 0x05,
        DOT11_CIPHER_ALGO_WPA_USE_GROUP = 0x100,
        DOT11_CIPHER_ALGO_RSN_USE_GROUP = 0x100,
        DOT11_CIPHER_ALGO_WEP = 0x101,
        DOT11_CIPHER_ALGO_IHV_START = 0x80000000,
        DOT11_CIPHER_ALGO_IHV_END = 0xffffffff
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WLAN_BSS_LIST
    {
        public uint dwTotalSize;
        public uint dwNumberOfItems;
        // Followed by WLAN_BSS_ENTRY structures
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WLAN_BSS_ENTRY
    {
        public DOT11_SSID dot11Ssid;
        public uint uPhyId;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 6)]
        public byte[] dot11Bssid;
        public DOT11_BSS_TYPE dot11BssType;
        public DOT11_PHY_TYPE dot11BssPhyType;
        public int lRssi;
        public uint uLinkQuality;
        public bool bInRegDomain;
        public ushort usBeaconPeriod;
        public ulong ullTimestamp;
        public ulong ullHostTimestamp;
        public ushort usCapabilityInformation;
        public uint ulChCenterFrequency;
        public WLAN_RATE_SET wlanRateSet;
        public uint ulIeOffset;
        public uint ulIeSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WLAN_RATE_SET
    {
        public uint uRateSetLength;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 126)]
        public ushort[] usRateSet;
    }

    #endregion
}

/// <summary>
/// Represents a discovered Wi-Fi network
/// </summary>
public class WifiNetwork
{
    /// <summary>
    /// Network SSID (Service Set Identifier)
    /// </summary>
    public string Ssid { get; set; } = string.Empty;

    /// <summary>
    /// BSSID (MAC address of access point) in format "AA:BB:CC:DD:EE:FF"
    /// </summary>
    public string? Bssid { get; set; }

    /// <summary>
    /// Signal quality (0-100)
    /// </summary>
    public int SignalQuality { get; set; }

    /// <summary>
    /// RSSI (Received Signal Strength Indicator) in dBm
    /// </summary>
    public int? Rssi { get; set; }

    /// <summary>
    /// Wi-Fi channel number
    /// </summary>
    public int Channel { get; set; }

    /// <summary>
    /// Frequency in kHz
    /// </summary>
    public int? Frequency { get; set; }

    /// <summary>
    /// Security type (Open, WEP, WPA, WPA2-PSK, WPA3, etc.)
    /// </summary>
    public string SecurityType { get; set; } = "Unknown";

    /// <summary>
    /// Whether this network is currently connected
    /// </summary>
    public bool IsConnected { get; set; }

    /// <summary>
    /// Network type (infrastructure, ad-hoc, etc.)
    /// </summary>
    public string NetworkType { get; set; } = string.Empty;

    /// <summary>
    /// Timestamp when network was detected
    /// </summary>
    public DateTime DetectedAt { get; set; }
}
