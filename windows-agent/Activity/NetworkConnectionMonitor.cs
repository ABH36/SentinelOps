using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace SentinelAgent.Activity
{
    /// <summary>
    /// Deep Network Connection Monitor
    /// Collects active network connections with process enrichment, geolocation, and threat detection
    /// </summary>
    public class NetworkConnectionMonitor : IDisposable
    {
        private static readonly HttpClient _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(10)
        };

        // Known threat IP ranges (basic feed - in production, integrate with threat intelligence APIs)
        private static readonly HashSet<string> _threatIpRanges = new HashSet<string>
        {
            // Tor exit nodes (sample)
            "185.220.100.", "185.220.101.", "185.220.102.",
            // Known malicious IPs (sample)
            "45.142.212.", "185.100.87.", "195.123.245.",
            // Suspicious hosting providers
            "5.188.", "185.143.", "194.87."
        };

        // Private IP ranges to exclude from geolocation
        private static readonly string[] _privateIpPrefixes = new[]
        {
            "10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.",
            "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.",
            "172.29.", "172.30.", "172.31.", "192.168.", "127.", "169.254."
        };

        public NetworkConnectionMonitor()
        {
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "SentinelOps-Agent/1.0");
        }

        /// <summary>
        /// Collect all active network connections with enrichment
        /// </summary>
        public async Task<List<NetworkConnection>> CollectConnectionsAsync()
        {
            var connections = new List<NetworkConnection>();

            try
            {
                // Step 1: Parse netstat output
                var rawConnections = ParseNetstatOutput();
                if (rawConnections.Count == 0)
                {
                    return connections;
                }

                // Step 2: Enrich with process information
                EnrichWithProcessInfo(rawConnections);

                // Step 3: Extract unique public IPs for geolocation
                var publicIps = rawConnections
                    .Where(c => !string.IsNullOrEmpty(c.RemoteAddress))
                    .Where(c => !IsPrivateIp(c.RemoteAddress))
                    .Select(c => c.RemoteAddress)
                    .Distinct()
                    .ToList();

                // Step 4: Batch geolocate public IPs
                Dictionary<string, GeoLocationInfo> geoCache = null;
                if (publicIps.Count > 0)
                {
                    geoCache = await BatchGeolocateIpsAsync(publicIps);
                }

                // Step 5: Apply geolocation and threat detection
                foreach (var conn in rawConnections)
                {
                    if (!string.IsNullOrEmpty(conn.RemoteAddress) && 
                        !IsPrivateIp(conn.RemoteAddress) && 
                        geoCache != null &&
                        geoCache.TryGetValue(conn.RemoteAddress, out var geo))
                    {
                        conn.Country = geo.Country;
                        conn.City = geo.City;
                        conn.Isp = geo.Isp;
                    }

                    // Check if remote IP is a threat
                    if (!string.IsNullOrEmpty(conn.RemoteAddress))
                    {
                        CheckThreatIp(conn);
                    }

                    connections.Add(conn);
                }
            }
            catch (Exception ex)
            {
                // Log error but return what we collected
                Debug.WriteLine($"[NetworkConnectionMonitor] Error collecting connections: {ex.Message}");
            }

            return connections;
        }

        /// <summary>
        /// Parse netstat -ano output
        /// </summary>
        private List<NetworkConnection> ParseNetstatOutput()
        {
            var connections = new List<NetworkConnection>();

            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "netstat",
                    Arguments = "-ano",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using (var process = Process.Start(psi))
                {
                    if (process == null) return connections;

                    var output = process.StandardOutput.ReadToEnd();
                    process.WaitForExit();

                    var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);

                    // netstat -ano format:
                    // Proto  Local Address          Foreign Address        State           PID
                    // TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1234
                    // TCP    192.168.1.10:49153     40.112.72.205:443      ESTABLISHED     5678

                    foreach (var line in lines)
                    {
                        if (!line.Trim().StartsWith("TCP") && !line.Trim().StartsWith("UDP"))
                            continue;

                        var parts = Regex.Split(line.Trim(), @"\s+");
                        if (parts.Length < 4) continue;

                        try
                        {
                            var protocol = parts[0];
                            var localEndpoint = parts[1];
                            var remoteEndpoint = parts[2];
                            string state = null;
                            int pid = 0;

                            if (protocol == "TCP")
                            {
                                if (parts.Length >= 5)
                                {
                                    state = parts[3];
                                    if (int.TryParse(parts[4], out var parsedPid))
                                    {
                                        pid = parsedPid;
                                    }
                                }
                            }
                            else // UDP
                            {
                                // UDP doesn't have state
                                if (parts.Length >= 4)
                                {
                                    if (int.TryParse(parts[3], out var parsedPid))
                                    {
                                        pid = parsedPid;
                                    }
                                }
                            }

                            // Parse local endpoint
                            var localParts = SplitEndpoint(localEndpoint);
                            var remoteParts = SplitEndpoint(remoteEndpoint);

                            var conn = new NetworkConnection
                            {
                                Protocol = protocol,
                                LocalAddress = localParts.address,
                                LocalPort = localParts.port,
                                RemoteAddress = remoteParts.address,
                                RemotePort = remoteParts.port,
                                State = state ?? "N/A",
                                Pid = pid,
                                CapturedAt = DateTime.UtcNow
                            };

                            connections.Add(conn);
                        }
                        catch
                        {
                            // Skip malformed lines
                            continue;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[NetworkConnectionMonitor] Error parsing netstat: {ex.Message}");
            }

            return connections;
        }

        /// <summary>
        /// Split endpoint into address and port
        /// </summary>
        private (string address, int port) SplitEndpoint(string endpoint)
        {
            var lastColon = endpoint.LastIndexOf(':');
            if (lastColon > 0)
            {
                var address = endpoint.Substring(0, lastColon);
                var portStr = endpoint.Substring(lastColon + 1);
                
                // Handle IPv6 brackets
                if (address.StartsWith("[") && address.EndsWith("]"))
                {
                    address = address.Substring(1, address.Length - 2);
                }

                if (int.TryParse(portStr, out var port))
                {
                    return (address, port);
                }
            }

            return (endpoint, 0);
        }

        /// <summary>
        /// Enrich connections with process information
        /// </summary>
        private void EnrichWithProcessInfo(List<NetworkConnection> connections)
        {
            foreach (var conn in connections)
            {
                if (conn.Pid <= 0) continue;

                try
                {
                    var process = Process.GetProcessById(conn.Pid);
                    conn.ProcessName = process.ProcessName;

                    try
                    {
                        conn.ProcessPath = process.MainModule?.FileName;
                    }
                    catch
                    {
                        // Access denied for some system processes
                        conn.ProcessPath = null;
                    }
                }
                catch
                {
                    // Process may have exited
                    conn.ProcessName = $"<exited:{conn.Pid}>";
                    conn.ProcessPath = null;
                }
            }
        }

        /// <summary>
        /// Batch geolocate IPs using ip-api.com
        /// Free tier: 45 requests/minute, max 100 IPs per batch
        /// </summary>
        private async Task<Dictionary<string, GeoLocationInfo>> BatchGeolocateIpsAsync(List<string> ips)
        {
            var result = new Dictionary<string, GeoLocationInfo>();

            if (ips.Count == 0) return result;

            try
            {
                // ip-api.com batch endpoint: POST http://ip-api.com/batch
                // Free tier allows up to 100 IPs per request
                var batches = ips.Select((ip, index) => new { ip, index })
                                 .GroupBy(x => x.index / 100)
                                 .Select(g => g.Select(x => x.ip).ToList())
                                 .ToList();

                foreach (var batch in batches)
                {
                    try
                    {
                        // Build JSON array of IPs with fields parameter
                        var requestBody = JsonSerializer.Serialize(
                            batch.Select(ip => new
                            {
                                query = ip,
                                fields = "status,message,country,city,isp,query"
                            }).ToArray()
                        );

                        var content = new StringContent(requestBody, Encoding.UTF8, "application/json");
                        var response = await _httpClient.PostAsync("http://ip-api.com/batch", content);

                        if (response.IsSuccessStatusCode)
                        {
                            var responseBody = await response.Content.ReadAsStringAsync();
                            var geoResults = JsonSerializer.Deserialize<GeoApiResponse[]>(responseBody);

                            if (geoResults != null)
                            {
                                foreach (var geoResult in geoResults)
                                {
                                    if (geoResult.status == "success" && !string.IsNullOrEmpty(geoResult.query))
                                    {
                                        result[geoResult.query] = new GeoLocationInfo
                                        {
                                            Country = geoResult.country ?? "Unknown",
                                            City = geoResult.city ?? "Unknown",
                                            Isp = geoResult.isp ?? "Unknown"
                                        };
                                    }
                                }
                            }
                        }

                        // Rate limiting: wait between batches
                        if (batches.Count > 1)
                        {
                            await Task.Delay(1500); // ~1.5 seconds between batches
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"[NetworkConnectionMonitor] Batch geolocation error: {ex.Message}");
                        // Continue with next batch
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[NetworkConnectionMonitor] Geolocation error: {ex.Message}");
            }

            return result;
        }

        /// <summary>
        /// Check if IP is in private range
        /// </summary>
        private bool IsPrivateIp(string ip)
        {
            if (string.IsNullOrEmpty(ip)) return true;
            if (ip == "0.0.0.0" || ip == "::" || ip == "*") return true;

            return _privateIpPrefixes.Any(prefix => ip.StartsWith(prefix));
        }

        /// <summary>
        /// Check if IP is a known threat
        /// </summary>
        private void CheckThreatIp(NetworkConnection conn)
        {
            if (string.IsNullOrEmpty(conn.RemoteAddress)) return;

            // Check against threat IP ranges
            foreach (var threatRange in _threatIpRanges)
            {
                if (conn.RemoteAddress.StartsWith(threatRange))
                {
                    conn.IsThreatIp = true;
                    conn.ThreatReason = "Known malicious IP range";
                    return;
                }
            }

            // Additional heuristics
            // Check for suspicious ports
            var suspiciousPorts = new[] { 4444, 5555, 6666, 6667, 6668, 6669, 7777, 8888, 9999, 31337 };
            if (suspiciousPorts.Contains(conn.RemotePort))
            {
                conn.IsThreatIp = true;
                conn.ThreatReason = $"Suspicious port {conn.RemotePort} commonly used by malware";
                return;
            }

            // Check for connections to non-standard ports by suspicious processes
            if (!string.IsNullOrEmpty(conn.ProcessName))
            {
                var suspiciousProcesses = new[] { "powershell", "cmd", "wscript", "cscript", "mshta", "regsvr32" };
                if (suspiciousProcesses.Any(p => conn.ProcessName.ToLower().Contains(p)) &&
                    conn.RemotePort != 80 && conn.RemotePort != 443)
                {
                    conn.IsThreatIp = true;
                    conn.ThreatReason = $"Suspicious process {conn.ProcessName} connecting to non-standard port {conn.RemotePort}";
                    return;
                }
            }
        }

        public void Dispose()
        {
            // HttpClient is static, don't dispose
        }
    }

    /// <summary>
    /// Network connection details
    /// </summary>
    public class NetworkConnection
    {
        public string Protocol { get; set; }
        public string LocalAddress { get; set; }
        public int LocalPort { get; set; }
        public string RemoteAddress { get; set; }
        public int RemotePort { get; set; }
        public string State { get; set; }
        public int Pid { get; set; }
        public string ProcessName { get; set; }
        public string ProcessPath { get; set; }
        
        // Geolocation info
        public string Country { get; set; }
        public string City { get; set; }
        public string Isp { get; set; }
        
        // Threat detection
        public bool IsThreatIp { get; set; }
        public string ThreatReason { get; set; }
        
        public DateTime CapturedAt { get; set; }
    }

    /// <summary>
    /// Geolocation information
    /// </summary>
    internal class GeoLocationInfo
    {
        public string Country { get; set; }
        public string City { get; set; }
        public string Isp { get; set; }
    }

    /// <summary>
    /// ip-api.com response format
    /// </summary>
    internal class GeoApiResponse
    {
        public string status { get; set; }
        public string message { get; set; }
        public string country { get; set; }
        public string city { get; set; }
        public string isp { get; set; }
        public string query { get; set; }
    }
}
