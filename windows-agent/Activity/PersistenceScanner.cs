using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32;
using System.Management;
using Serilog;

namespace SentinelOpsAgent.Activity
{
    /// <summary>
    /// Scans Windows persistence mechanisms to detect malware and unauthorized autorun entries.
    /// Monitors Registry Run keys, Startup folders, Services, and Scheduled Tasks.
    /// </summary>
    public class PersistenceScanner : IDisposable
    {
        private readonly ILogger _logger;
        private Dictionary<string, PersistenceEntry> _previousEntries = new();

        // Registry autorun locations
        private readonly string[] _autoRunKeys = new[]
        {
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce",
            @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run",
            @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\RunOnce",
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run",
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\RunServices",
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\RunServicesOnce",
        };

        // Startup folder paths
        private readonly string[] _startupFolders = new[]
        {
            @"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup)),
        };

        // Suspicious path patterns
        private readonly string[] _suspiciousPathPatterns = new[]
        {
            @"\Temp\",
            @"\AppData\Local\Temp\",
            @"\Downloads\",
            @"\Public\",
            @"%TEMP%",
            @"%TMP%",
        };

        // Suspicious file extensions
        private readonly string[] _suspiciousExtensions = new[]
        {
            ".tmp", ".dat", ".bin", ".vbs", ".js", ".wsf", ".bat", ".cmd", ".ps1"
        };

        public PersistenceScanner(ILogger logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Perform a complete persistence scan and return all entries
        /// </summary>
        public List<PersistenceEntry> ScanAll()
        {
            var allEntries = new List<PersistenceEntry>();

            try
            {
                _logger.Information("Starting comprehensive persistence scan");

                // Scan Registry Run keys
                var registryEntries = ScanRegistryAutoRun();
                allEntries.AddRange(registryEntries);
                _logger.Debug("Found {Count} registry autorun entries", registryEntries.Count);

                // Scan Startup folders
                var startupEntries = ScanStartupFolders();
                allEntries.AddRange(startupEntries);
                _logger.Debug("Found {Count} startup folder entries", startupEntries.Count);

                // Scan Windows Services
                var serviceEntries = ScanServices();
                allEntries.AddRange(serviceEntries);
                _logger.Debug("Found {Count} service entries", serviceEntries.Count);

                // Scan Scheduled Tasks
                var taskEntries = ScanScheduledTasks();
                allEntries.AddRange(taskEntries);
                _logger.Debug("Found {Count} scheduled task entries", taskEntries.Count);

                // Analyze each entry for threats
                foreach (var entry in allEntries)
                {
                    AnalyzeThreat(entry);
                }

                _logger.Information("Persistence scan complete: {Total} total entries ({Suspicious} suspicious)",
                    allEntries.Count, allEntries.Count(e => e.IsSuspicious));

                return allEntries;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error during persistence scan");
                return allEntries;
            }
        }

        /// <summary>
        /// Get new or modified entries since last scan
        /// </summary>
        public List<PersistenceEntry> GetChanges()
        {
            var currentEntries = ScanAll();
            var changes = new List<PersistenceEntry>();

            // Build lookup dictionary for current entries
            var currentLookup = currentEntries.ToDictionary(
                e => GetEntryKey(e),
                e => e
            );

            // Find new or modified entries
            foreach (var current in currentEntries)
            {
                var key = GetEntryKey(current);
                
                if (!_previousEntries.ContainsKey(key))
                {
                    // New entry
                    current.ChangeType = "ADDED";
                    changes.Add(current);
                }
                else
                {
                    var previous = _previousEntries[key];
                    
                    // Check if command changed
                    if (previous.Command != current.Command || previous.FilePath != current.FilePath)
                    {
                        current.ChangeType = "MODIFIED";
                        changes.Add(current);
                    }
                }
            }

            // Find removed entries
            foreach (var previous in _previousEntries.Values)
            {
                var key = GetEntryKey(previous);
                
                if (!currentLookup.ContainsKey(key))
                {
                    previous.ChangeType = "REMOVED";
                    changes.Add(previous);
                }
            }

            // Update previous entries
            _previousEntries = currentLookup;

            if (changes.Count > 0)
            {
                _logger.Information("Detected {Count} persistence changes", changes.Count);
            }

            return changes;
        }

        /// <summary>
        /// Scan Registry autorun keys
        /// </summary>
        private List<PersistenceEntry> ScanRegistryAutoRun()
        {
            var entries = new List<PersistenceEntry>();

            foreach (var keyPath in _autoRunKeys)
            {
                try
                {
                    // Scan HKEY_LOCAL_MACHINE
                    ScanRegistryKey(Registry.LocalMachine, keyPath, "HKLM", entries);

                    // Scan HKEY_CURRENT_USER
                    ScanRegistryKey(Registry.CurrentUser, keyPath, "HKCU", entries);
                }
                catch (Exception ex)
                {
                    _logger.Warning(ex, "Error scanning registry key: {Key}", keyPath);
                }
            }

            return entries;
        }

        /// <summary>
        /// Scan a specific registry key for autorun entries
        /// </summary>
        private void ScanRegistryKey(RegistryKey root, string path, string hive, List<PersistenceEntry> results)
        {
            try
            {
                using var key = root.OpenSubKey(path);
                if (key == null) return;

                foreach (var valueName in key.GetValueNames())
                {
                    try
                    {
                        var command = key.GetValue(valueName)?.ToString() ?? "";
                        
                        if (string.IsNullOrWhiteSpace(command))
                            continue;

                        var entry = new PersistenceEntry
                        {
                            Type = "Registry",
                            Location = $"{hive}\\{path}",
                            Name = valueName,
                            Command = command,
                            FilePath = ExtractFilePath(command),
                            ScannedAt = DateTime.UtcNow
                        };

                        // Calculate file hash if file exists
                        if (!string.IsNullOrEmpty(entry.FilePath) && File.Exists(entry.FilePath))
                        {
                            entry.FileHash = CalculateSHA256(entry.FilePath);
                        }

                        results.Add(entry);
                    }
                    catch (Exception ex)
                    {
                        _logger.Warning(ex, "Error reading registry value: {Name}", valueName);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Error opening registry key: {Hive}\\{Path}", hive, path);
            }
        }

        /// <summary>
        /// Scan Startup folders
        /// </summary>
        private List<PersistenceEntry> ScanStartupFolders()
        {
            var entries = new List<PersistenceEntry>();

            foreach (var folder in _startupFolders)
            {
                try
                {
                    if (!Directory.Exists(folder))
                        continue;

                    var files = Directory.GetFiles(folder, "*.*", SearchOption.TopDirectoryOnly);

                    foreach (var file in files)
                    {
                        try
                        {
                            var fileInfo = new FileInfo(file);
                            
                            var entry = new PersistenceEntry
                            {
                                Type = "Startup Folder",
                                Location = folder,
                                Name = fileInfo.Name,
                                Command = file,
                                FilePath = file,
                                FileHash = CalculateSHA256(file),
                                ScannedAt = DateTime.UtcNow
                            };

                            entries.Add(entry);
                        }
                        catch (Exception ex)
                        {
                            _logger.Warning(ex, "Error scanning startup file: {File}", file);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.Warning(ex, "Error scanning startup folder: {Folder}", folder);
                }
            }

            return entries;
        }

        /// <summary>
        /// Scan Windows Services
        /// </summary>
        private List<PersistenceEntry> ScanServices()
        {
            var entries = new List<PersistenceEntry>();

            try
            {
                using var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_Service");
                using var collection = searcher.Get();

                foreach (ManagementObject service in collection)
                {
                    try
                    {
                        var name = service["Name"]?.ToString() ?? "";
                        var displayName = service["DisplayName"]?.ToString() ?? "";
                        var pathName = service["PathName"]?.ToString() ?? "";
                        var startMode = service["StartMode"]?.ToString() ?? "";
                        var state = service["State"]?.ToString() ?? "";
                        var startName = service["StartName"]?.ToString() ?? "";

                        // Only track services that start automatically
                        if (startMode != "Auto" && startMode != "Automatic")
                            continue;

                        var entry = new PersistenceEntry
                        {
                            Type = "Service",
                            Location = "Services",
                            Name = name,
                            DisplayName = displayName,
                            Command = pathName,
                            FilePath = ExtractFilePath(pathName),
                            StartMode = startMode,
                            ServiceState = state,
                            ServiceAccount = startName,
                            ScannedAt = DateTime.UtcNow
                        };

                        // Calculate file hash if file exists
                        if (!string.IsNullOrEmpty(entry.FilePath) && File.Exists(entry.FilePath))
                        {
                            entry.FileHash = CalculateSHA256(entry.FilePath);
                        }

                        entries.Add(entry);
                    }
                    catch (Exception ex)
                    {
                        _logger.Warning(ex, "Error scanning service");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error scanning services");
            }

            return entries;
        }

        /// <summary>
        /// Scan Scheduled Tasks
        /// </summary>
        private List<PersistenceEntry> ScanScheduledTasks()
        {
            var entries = new List<PersistenceEntry>();

            try
            {
                // Use schtasks command to list scheduled tasks
                var process = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "schtasks",
                    Arguments = "/Query /FO CSV /V",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                });

                if (process == null)
                {
                    _logger.Warning("Failed to start schtasks process");
                    return entries;
                }

                var output = process.StandardOutput.ReadToEnd();
                process.WaitForExit();

                // Parse CSV output
                var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                
                if (lines.Length < 2)
                    return entries;

                // Skip header line
                for (int i = 1; i < lines.Length; i++)
                {
                    try
                    {
                        var parts = ParseCsvLine(lines[i]);
                        
                        if (parts.Length < 10)
                            continue;

                        var taskName = parts[0].Trim('"');
                        var status = parts[2].Trim('"');
                        var taskToRun = parts[8].Trim('"');
                        var author = parts.Length > 9 ? parts[9].Trim('"') : "";

                        // Skip disabled tasks
                        if (status.Equals("Disabled", StringComparison.OrdinalIgnoreCase))
                            continue;

                        var entry = new PersistenceEntry
                        {
                            Type = "Scheduled Task",
                            Location = "Task Scheduler",
                            Name = taskName,
                            Command = taskToRun,
                            FilePath = ExtractFilePath(taskToRun),
                            TaskStatus = status,
                            TaskAuthor = author,
                            ScannedAt = DateTime.UtcNow
                        };

                        // Calculate file hash if file exists
                        if (!string.IsNullOrEmpty(entry.FilePath) && File.Exists(entry.FilePath))
                        {
                            entry.FileHash = CalculateSHA256(entry.FilePath);
                        }

                        entries.Add(entry);
                    }
                    catch (Exception ex)
                    {
                        _logger.Warning(ex, "Error parsing scheduled task line");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error scanning scheduled tasks");
            }

            return entries;
        }

        /// <summary>
        /// Analyze persistence entry for threats
        /// </summary>
        private void AnalyzeThreat(PersistenceEntry entry)
        {
            var threats = new List<string>();
            var riskScore = 0;

            // Check for suspicious paths
            if (!string.IsNullOrEmpty(entry.FilePath))
            {
                var lowerPath = entry.FilePath.ToLower();

                foreach (var pattern in _suspiciousPathPatterns)
                {
                    if (lowerPath.Contains(pattern.ToLower()))
                    {
                        threats.Add("SUSPICIOUS_PATH");
                        riskScore += 2;
                        break;
                    }
                }

                // Check for suspicious extensions
                var extension = Path.GetExtension(entry.FilePath).ToLower();
                if (_suspiciousExtensions.Contains(extension))
                {
                    threats.Add("SUSPICIOUS_EXTENSION");
                    riskScore += 2;
                }

                // Check if file doesn't exist
                if (!File.Exists(entry.FilePath))
                {
                    threats.Add("FILE_NOT_FOUND");
                    riskScore += 3;
                }
            }

            // Check for obfuscated commands
            if (!string.IsNullOrEmpty(entry.Command))
            {
                var lowerCommand = entry.Command.ToLower();

                if (lowerCommand.Contains("powershell") && (lowerCommand.Contains("-enc") || lowerCommand.Contains("-encodedcommand")))
                {
                    threats.Add("ENCODED_POWERSHELL");
                    riskScore += 4;
                }

                if (lowerCommand.Contains("wscript") || lowerCommand.Contains("cscript"))
                {
                    threats.Add("SCRIPT_EXECUTION");
                    riskScore += 2;
                }

                if (lowerCommand.Contains("regsvr32") || lowerCommand.Contains("rundll32"))
                {
                    threats.Add("DLL_EXECUTION");
                    riskScore += 2;
                }

                if (lowerCommand.Contains("http://") || lowerCommand.Contains("https://"))
                {
                    threats.Add("REMOTE_DOWNLOAD");
                    riskScore += 3;
                }
            }

            // Check for suspicious service accounts (for services)
            if (entry.Type == "Service" && !string.IsNullOrEmpty(entry.ServiceAccount))
            {
                if (entry.ServiceAccount.Equals("LocalSystem", StringComparison.OrdinalIgnoreCase))
                {
                    threats.Add("SYSTEM_ACCOUNT_SERVICE");
                    riskScore += 1;
                }
            }

            // Determine risk level
            entry.Threats = threats.ToArray();
            entry.RiskScore = riskScore;
            
            if (riskScore >= 5)
            {
                entry.RiskLevel = "HIGH";
                entry.IsSuspicious = true;
            }
            else if (riskScore >= 3)
            {
                entry.RiskLevel = "MEDIUM";
                entry.IsSuspicious = true;
            }
            else if (riskScore > 0)
            {
                entry.RiskLevel = "LOW";
            }
            else
            {
                entry.RiskLevel = "NONE";
            }
        }

        /// <summary>
        /// Extract file path from command line
        /// </summary>
        private string ExtractFilePath(string command)
        {
            if (string.IsNullOrWhiteSpace(command))
                return "";

            // Remove quotes
            command = command.Trim().Trim('"');

            // Handle environment variables
            command = Environment.ExpandEnvironmentVariables(command);

            // Extract executable path (before first space or argument)
            var spaceIndex = command.IndexOf(' ');
            if (spaceIndex > 0)
            {
                command = command.Substring(0, spaceIndex);
            }

            // Clean up path
            command = command.Trim('"').Trim();

            return command;
        }

        /// <summary>
        /// Calculate SHA256 hash of file
        /// </summary>
        private string CalculateSHA256(string filePath)
        {
            try
            {
                using var sha256 = SHA256.Create();
                using var stream = File.OpenRead(filePath);
                var hash = sha256.ComputeHash(stream);
                return BitConverter.ToString(hash).Replace("-", "").ToLower();
            }
            catch
            {
                return "";
            }
        }

        /// <summary>
        /// Parse CSV line (handles quoted values)
        /// </summary>
        private string[] ParseCsvLine(string line)
        {
            var parts = new List<string>();
            var current = new StringBuilder();
            var inQuotes = false;

            foreach (var c in line)
            {
                if (c == '"')
                {
                    inQuotes = !inQuotes;
                }
                else if (c == ',' && !inQuotes)
                {
                    parts.Add(current.ToString());
                    current.Clear();
                }
                else
                {
                    current.Append(c);
                }
            }

            parts.Add(current.ToString());
            return parts.ToArray();
        }

        /// <summary>
        /// Get unique key for persistence entry
        /// </summary>
        private string GetEntryKey(PersistenceEntry entry)
        {
            return $"{entry.Type}|{entry.Location}|{entry.Name}";
        }

        public void Dispose()
        {
            _logger.Information("PersistenceScanner disposed");
        }
    }

    /// <summary>
    /// Represents a persistence mechanism entry
    /// </summary>
    public class PersistenceEntry
    {
        public string Type { get; set; } = ""; // Registry, Startup Folder, Service, Scheduled Task
        public string Location { get; set; } = ""; // Registry path, folder path, etc.
        public string Name { get; set; } = ""; // Entry name, service name, task name
        public string DisplayName { get; set; } = ""; // Service display name
        public string Command { get; set; } = ""; // Full command line
        public string FilePath { get; set; } = ""; // Extracted executable path
        public string FileHash { get; set; } = ""; // SHA256 hash
        public string StartMode { get; set; } = ""; // Service start mode
        public string ServiceState { get; set; } = ""; // Service state
        public string ServiceAccount { get; set; } = ""; // Service account
        public string TaskStatus { get; set; } = ""; // Scheduled task status
        public string TaskAuthor { get; set; } = ""; // Task author
        public string[] Threats { get; set; } = Array.Empty<string>(); // Detected threats
        public int RiskScore { get; set; } = 0; // Numeric risk score
        public string RiskLevel { get; set; } = "NONE"; // NONE, LOW, MEDIUM, HIGH
        public bool IsSuspicious { get; set; } = false; // Flag for suspicious entries
        public string ChangeType { get; set; } = ""; // ADDED, MODIFIED, REMOVED
        public DateTime ScannedAt { get; set; }
    }
}
