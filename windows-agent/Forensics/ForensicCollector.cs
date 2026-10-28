using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Management;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace SentinelAgent.Forensics
{
    /// <summary>
    /// Comprehensive forensic data collector for incident response and security investigations.
    /// Collects system state, network activity, persistence mechanisms, and security events.
    /// </summary>
    public class ForensicCollector
    {
        /// <summary>
        /// Collects all active network connections with process associations.
        /// Equivalent to: netstat -ano
        /// </summary>
        public List<NetworkConnection> CollectNetstat()
        {
            var connections = new List<NetworkConnection>();

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = "netstat",
                    Arguments = "-ano",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using (var process = Process.Start(startInfo))
                {
                    string output = process.StandardOutput.ReadToEnd();
                    process.WaitForExit();

                    // Parse netstat output (skip header lines)
                    var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (var line in lines.Skip(4)) // Skip header lines
                    {
                        var parts = Regex.Split(line.Trim(), @"\s+");
                        if (parts.Length >= 5)
                        {
                            connections.Add(new NetworkConnection
                            {
                                Protocol = parts[0],
                                LocalAddress = parts[1],
                                ForeignAddress = parts[2],
                                State = parts[3],
                                ProcessId = int.TryParse(parts[4], out int pid) ? pid : 0,
                                ProcessName = GetProcessNameById(int.TryParse(parts[4], out int p) ? p : 0),
                                CollectedAt = DateTime.UtcNow
                            });
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ForensicCollector] Netstat collection failed: {ex.Message}");
            }

            return connections;
        }

        /// <summary>
        /// Collects DNS resolver cache showing recently queried domains.
        /// Equivalent to: ipconfig /displaydns
        /// </summary>
        public List<DnsCacheEntry> CollectDnsCache()
        {
            var entries = new List<DnsCacheEntry>();

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = "ipconfig",
                    Arguments = "/displaydns",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using (var process = Process.Start(startInfo))
                {
                    string output = process.StandardOutput.ReadToEnd();
                    process.WaitForExit();

                    // Parse DNS cache (record names appear after "Record Name . . . . . :")
                    var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                    string currentRecordName = null;
                    string currentRecordType = null;

                    foreach (var line in lines)
                    {
                        if (line.Contains("Record Name"))
                        {
                            currentRecordName = line.Split(':').Last().Trim();
                        }
                        else if (line.Contains("Record Type"))
                        {
                            currentRecordType = line.Split(':').Last().Trim();
                        }
                        else if (line.Contains("Data Length") && currentRecordName != null)
                        {
                            entries.Add(new DnsCacheEntry
                            {
                                RecordName = currentRecordName,
                                RecordType = currentRecordType ?? "Unknown",
                                CollectedAt = DateTime.UtcNow
                            });
                            currentRecordName = null;
                            currentRecordType = null;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ForensicCollector] DNS cache collection failed: {ex.Message}");
            }

            return entries;
        }

        /// <summary>
        /// Collects Windows Firewall rules (all profiles).
        /// Equivalent to: netsh advfirewall firewall show rule name=all
        /// </summary>
        public List<FirewallRule> CollectFirewallRules()
        {
            var rules = new List<FirewallRule>();

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = "netsh",
                    Arguments = "advfirewall firewall show rule name=all",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using (var process = Process.Start(startInfo))
                {
                    string output = process.StandardOutput.ReadToEnd();
                    process.WaitForExit();

                    // Parse firewall rules
                    var ruleBlocks = output.Split(new[] { "\r\n\r\n" }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (var block in ruleBlocks)
                    {
                        var lines = block.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                        var rule = new FirewallRule { CollectedAt = DateTime.UtcNow };

                        foreach (var line in lines)
                        {
                            if (line.StartsWith("Rule Name:"))
                                rule.RuleName = line.Substring(10).Trim();
                            else if (line.StartsWith("Enabled:"))
                                rule.Enabled = line.Contains("Yes");
                            else if (line.StartsWith("Direction:"))
                                rule.Direction = line.Substring(10).Trim();
                            else if (line.StartsWith("Profiles:"))
                                rule.Profiles = line.Substring(9).Trim();
                            else if (line.StartsWith("Action:"))
                                rule.Action = line.Substring(7).Trim();
                        }

                        if (!string.IsNullOrEmpty(rule.RuleName))
                        {
                            rules.Add(rule);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ForensicCollector] Firewall rules collection failed: {ex.Message}");
            }

            return rules;
        }

        /// <summary>
        /// Collects all running processes with full details (path, command line, user).
        /// </summary>
        public List<ForensicProcess> CollectRunningProcesses()
        {
            var processes = new List<ForensicProcess>();

            try
            {
                foreach (var proc in Process.GetProcesses())
                {
                    try
                    {
                        var forensicProc = new ForensicProcess
                        {
                            ProcessId = proc.Id,
                            ProcessName = proc.ProcessName,
                            StartTime = proc.StartTime,
                            CollectedAt = DateTime.UtcNow
                        };

                        // Try to get executable path
                        try
                        {
                            forensicProc.ExecutablePath = proc.MainModule?.FileName;
                        }
                        catch { }

                        // Try to get command line via WMI
                        try
                        {
                            using (var searcher = new ManagementObjectSearcher(
                                $"SELECT CommandLine FROM Win32_Process WHERE ProcessId = {proc.Id}"))
                            {
                                foreach (ManagementObject obj in searcher.Get())
                                {
                                    forensicProc.CommandLine = obj["CommandLine"]?.ToString();
                                }
                            }
                        }
                        catch { }

                        processes.Add(forensicProc);
                    }
                    catch
                    {
                        // Skip processes we can't access
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ForensicCollector] Process collection failed: {ex.Message}");
            }

            return processes;
        }

        /// <summary>
        /// Collects all scheduled tasks.
        /// Equivalent to: schtasks /query /fo CSV /v
        /// </summary>
        public List<ScheduledTaskEntry> CollectScheduledTasks()
        {
            var tasks = new List<ScheduledTaskEntry>();

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = "schtasks",
                    Arguments = "/query /fo CSV /v",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using (var process = Process.Start(startInfo))
                {
                    string output = process.StandardOutput.ReadToEnd();
                    process.WaitForExit();

                    var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (var line in lines.Skip(1)) // Skip header
                    {
                        var parts = ParseCsvLine(line);
                        if (parts.Length >= 3)
                        {
                            tasks.Add(new ScheduledTaskEntry
                            {
                                TaskName = parts[0].Trim('"'),
                                NextRunTime = parts[1].Trim('"'),
                                Status = parts[2].Trim('"'),
                                TaskToRun = parts.Length > 8 ? parts[8].Trim('"') : "",
                                CollectedAt = DateTime.UtcNow
                            });
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ForensicCollector] Scheduled tasks collection failed: {ex.Message}");
            }

            return tasks;
        }

        /// <summary>
        /// Collects autorun/persistence entries from registry Run keys.
        /// Checks: HKLM and HKCU Run, RunOnce keys
        /// </summary>
        public List<AutoRunEntry> CollectAutoRunEntries()
        {
            var entries = new List<AutoRunEntry>();

            var runKeys = new[]
            {
                (Registry.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run"),
                (Registry.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce"),
                (Registry.CurrentUser, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run"),
                (Registry.CurrentUser, @"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce"),
                (Registry.LocalMachine, @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run"),
                (Registry.LocalMachine, @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\RunOnce")
            };

            foreach (var (hive, path) in runKeys)
            {
                try
                {
                    using (var key = hive.OpenSubKey(path))
                    {
                        if (key != null)
                        {
                            foreach (var valueName in key.GetValueNames())
                            {
                                var value = key.GetValue(valueName)?.ToString();
                                entries.Add(new AutoRunEntry
                                {
                                    Location = $"{(hive == Registry.LocalMachine ? "HKLM" : "HKCU")}\\{path}",
                                    Name = valueName,
                                    Command = value,
                                    CollectedAt = DateTime.UtcNow
                                });
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[ForensicCollector] AutoRun key {path} failed: {ex.Message}");
                }
            }

            return entries;
        }

        /// <summary>
        /// Collects installed drivers.
        /// Equivalent to: driverquery /v /fo CSV
        /// </summary>
        public List<DriverEntry> CollectInstalledDrivers()
        {
            var drivers = new List<DriverEntry>();

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = "driverquery",
                    Arguments = "/v /fo CSV",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using (var process = Process.Start(startInfo))
                {
                    string output = process.StandardOutput.ReadToEnd();
                    process.WaitForExit();

                    var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (var line in lines.Skip(1)) // Skip header
                    {
                        var parts = ParseCsvLine(line);
                        if (parts.Length >= 5)
                        {
                            drivers.Add(new DriverEntry
                            {
                                ModuleName = parts[0].Trim('"'),
                                DisplayName = parts[1].Trim('"'),
                                DriverType = parts[2].Trim('"'),
                                StartMode = parts[3].Trim('"'),
                                State = parts[4].Trim('"'),
                                CollectedAt = DateTime.UtcNow
                            });
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ForensicCollector] Driver collection failed: {ex.Message}");
            }

            return drivers;
        }

        /// <summary>
        /// Collects critical Windows Security Event Log entries.
        /// Key Event IDs: 4624 (logon), 4625 (failed logon), 4648 (explicit creds),
        /// 4672 (special privileges), 4720 (user created), 4688 (process created)
        /// </summary>
        public List<SecurityEvent> CollectSecurityEvents(int maxEvents = 100)
        {
            var events = new List<SecurityEvent>();

            try
            {
                var eventLog = new EventLog("Security");
                var criticalEventIds = new[] { 4624, 4625, 4648, 4672, 4720, 4688, 4697 };

                var entries = eventLog.Entries
                    .Cast<EventLogEntry>()
                    .Where(e => criticalEventIds.Contains((int)e.InstanceId))
                    .OrderByDescending(e => e.TimeGenerated)
                    .Take(maxEvents);

                foreach (var entry in entries)
                {
                    events.Add(new SecurityEvent
                    {
                        EventId = (int)entry.InstanceId,
                        TimeGenerated = entry.TimeGenerated,
                        Source = entry.Source,
                        Message = entry.Message,
                        UserName = entry.UserName,
                        CollectedAt = DateTime.UtcNow
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ForensicCollector] Security event collection failed: {ex.Message}");
            }

            return events;
        }

        /// <summary>
        /// Computes unique hardware fingerprint for device identification.
        /// Uses: MachineGuid + MAC addresses + CPU serial number
        /// </summary>
        public string ComputeHardwareHash()
        {
            var components = new List<string>();

            try
            {
                // Machine GUID
                using (var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography"))
                {
                    var guid = key?.GetValue("MachineGuid")?.ToString();
                    if (guid != null) components.Add(guid);
                }

                // MAC addresses
                foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (nic.OperationalStatus == OperationalStatus.Up &&
                        nic.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                    {
                        components.Add(nic.GetPhysicalAddress().ToString());
                    }
                }

                // CPU serial (if available via WMI)
                try
                {
                    using (var searcher = new ManagementObjectSearcher("SELECT ProcessorId FROM Win32_Processor"))
                    {
                        foreach (ManagementObject obj in searcher.Get())
                        {
                            components.Add(obj["ProcessorId"]?.ToString());
                        }
                    }
                }
                catch { }

                // Compute SHA256 hash
                var combined = string.Join("|", components.Where(c => !string.IsNullOrEmpty(c)));
                using (var sha256 = SHA256.Create())
                {
                    var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(combined));
                    return BitConverter.ToString(hashBytes).Replace("-", "").ToLower();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ForensicCollector] Hardware hash computation failed: {ex.Message}");
                return "unknown";
            }
        }

        /// <summary>
        /// Collects all forensic data into a single comprehensive bundle.
        /// </summary>
        public ForensicBundle CollectAll()
        {
            Console.WriteLine("[ForensicCollector] Starting full diagnostic collection...");

            var bundle = new ForensicBundle
            {
                CollectionStarted = DateTime.UtcNow,
                MachineName = Environment.MachineName,
                UserName = Environment.UserName,
                OsVersion = Environment.OSVersion.ToString(),
                HardwareHash = ComputeHardwareHash()
            };

            bundle.NetworkConnections = CollectNetstat();
            Console.WriteLine($"[ForensicCollector] Collected {bundle.NetworkConnections.Count} network connections");

            bundle.DnsCache = CollectDnsCache();
            Console.WriteLine($"[ForensicCollector] Collected {bundle.DnsCache.Count} DNS cache entries");

            bundle.FirewallRules = CollectFirewallRules();
            Console.WriteLine($"[ForensicCollector] Collected {bundle.FirewallRules.Count} firewall rules");

            bundle.RunningProcesses = CollectRunningProcesses();
            Console.WriteLine($"[ForensicCollector] Collected {bundle.RunningProcesses.Count} running processes");

            bundle.ScheduledTasks = CollectScheduledTasks();
            Console.WriteLine($"[ForensicCollector] Collected {bundle.ScheduledTasks.Count} scheduled tasks");

            bundle.AutoRunEntries = CollectAutoRunEntries();
            Console.WriteLine($"[ForensicCollector] Collected {bundle.AutoRunEntries.Count} autorun entries");

            bundle.InstalledDrivers = CollectInstalledDrivers();
            Console.WriteLine($"[ForensicCollector] Collected {bundle.InstalledDrivers.Count} installed drivers");

            bundle.SecurityEvents = CollectSecurityEvents();
            Console.WriteLine($"[ForensicCollector] Collected {bundle.SecurityEvents.Count} security events");

            bundle.CollectionCompleted = DateTime.UtcNow;
            bundle.CollectionDurationMs = (int)(bundle.CollectionCompleted - bundle.CollectionStarted).TotalMilliseconds;

            Console.WriteLine($"[ForensicCollector] Collection complete in {bundle.CollectionDurationMs}ms");

            return bundle;
        }

        // Helper methods

        private string GetProcessNameById(int pid)
        {
            try
            {
                var proc = Process.GetProcessById(pid);
                return proc.ProcessName;
            }
            catch
            {
                return "Unknown";
            }
        }

        private string[] ParseCsvLine(string line)
        {
            var result = new List<string>();
            bool inQuotes = false;
            var currentField = new StringBuilder();

            foreach (char c in line)
            {
                if (c == '"')
                {
                    inQuotes = !inQuotes;
                }
                else if (c == ',' && !inQuotes)
                {
                    result.Add(currentField.ToString());
                    currentField.Clear();
                }
                else
                {
                    currentField.Append(c);
                }
            }

            result.Add(currentField.ToString());
            return result.ToArray();
        }
    }

    // Data models for forensic artifacts

    public class NetworkConnection
    {
        public string Protocol { get; set; }
        public string LocalAddress { get; set; }
        public string ForeignAddress { get; set; }
        public string State { get; set; }
        public int ProcessId { get; set; }
        public string ProcessName { get; set; }
        public DateTime CollectedAt { get; set; }
    }

    public class DnsCacheEntry
    {
        public string RecordName { get; set; }
        public string RecordType { get; set; }
        public DateTime CollectedAt { get; set; }
    }

    public class FirewallRule
    {
        public string RuleName { get; set; }
        public bool Enabled { get; set; }
        public string Direction { get; set; }
        public string Profiles { get; set; }
        public string Action { get; set; }
        public DateTime CollectedAt { get; set; }
    }

    public class ForensicProcess
    {
        public int ProcessId { get; set; }
        public string ProcessName { get; set; }
        public string ExecutablePath { get; set; }
        public string CommandLine { get; set; }
        public DateTime StartTime { get; set; }
        public DateTime CollectedAt { get; set; }
    }

    public class ScheduledTaskEntry
    {
        public string TaskName { get; set; }
        public string NextRunTime { get; set; }
        public string Status { get; set; }
        public string TaskToRun { get; set; }
        public DateTime CollectedAt { get; set; }
    }

    public class AutoRunEntry
    {
        public string Location { get; set; }
        public string Name { get; set; }
        public string Command { get; set; }
        public DateTime CollectedAt { get; set; }
    }

    public class DriverEntry
    {
        public string ModuleName { get; set; }
        public string DisplayName { get; set; }
        public string DriverType { get; set; }
        public string StartMode { get; set; }
        public string State { get; set; }
        public DateTime CollectedAt { get; set; }
    }

    public class SecurityEvent
    {
        public int EventId { get; set; }
        public DateTime TimeGenerated { get; set; }
        public string Source { get; set; }
        public string Message { get; set; }
        public string UserName { get; set; }
        public DateTime CollectedAt { get; set; }
    }

    public class ForensicBundle
    {
        public DateTime CollectionStarted { get; set; }
        public DateTime CollectionCompleted { get; set; }
        public int CollectionDurationMs { get; set; }
        public string MachineName { get; set; }
        public string UserName { get; set; }
        public string OsVersion { get; set; }
        public string HardwareHash { get; set; }

        public List<NetworkConnection> NetworkConnections { get; set; } = new List<NetworkConnection>();
        public List<DnsCacheEntry> DnsCache { get; set; } = new List<DnsCacheEntry>();
        public List<FirewallRule> FirewallRules { get; set; } = new List<FirewallRule>();
        public List<ForensicProcess> RunningProcesses { get; set; } = new List<ForensicProcess>();
        public List<ScheduledTaskEntry> ScheduledTasks { get; set; } = new List<ScheduledTaskEntry>();
        public List<AutoRunEntry> AutoRunEntries { get; set; } = new List<AutoRunEntry>();
        public List<DriverEntry> InstalledDrivers { get; set; } = new List<DriverEntry>();
        public List<SecurityEvent> SecurityEvents { get; set; } = new List<SecurityEvent>();

        public int GetTotalArtifactCount()
        {
            return NetworkConnections.Count +
                   DnsCache.Count +
                   FirewallRules.Count +
                   RunningProcesses.Count +
                   ScheduledTasks.Count +
                   AutoRunEntries.Count +
                   InstalledDrivers.Count +
                   SecurityEvents.Count;
        }
    }
}
