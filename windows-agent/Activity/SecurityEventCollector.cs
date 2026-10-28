using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Diagnostics.Eventing.Reader;
using System.Linq;
using System.Text.Json;
using Serilog;

namespace SentinelOpsAgent.Activity
{
    /// <summary>
    /// Collects critical Windows Security Event Log events for threat detection and compliance.
    /// Monitors specific event IDs related to authentication, privilege escalation, and suspicious activity.
    /// </summary>
    public class SecurityEventCollector : IDisposable
    {
        private readonly ILogger _logger;
        private DateTime _lastCollectionTime;
        private readonly int _maxBatchSize = 200;
        private bool _isInitialized = false;

        // Critical Security Event IDs to monitor
        private readonly int[] _monitoredEventIds = new[]
        {
            4624,  // Successful logon
            4625,  // Failed logon
            4648,  // Logon using explicit credentials (RunAs)
            4672,  // Special privileges assigned to new logon
            4720,  // User account created
            4732,  // Member added to security-enabled local group
            4688,  // New process created
            4698,  // Scheduled task created
            4104,  // PowerShell script block logging
            7045   // Service installed
        };

        // Event ID descriptions for context
        private readonly Dictionary<int, string> _eventDescriptions = new()
        {
            { 4624, "Successful Logon" },
            { 4625, "Failed Logon Attempt" },
            { 4648, "Logon with Explicit Credentials (RunAs)" },
            { 4672, "Special Privileges Assigned to New Logon" },
            { 4720, "User Account Created" },
            { 4732, "Member Added to Security-Enabled Local Group" },
            { 4688, "New Process Created" },
            { 4698, "Scheduled Task Created" },
            { 4104, "PowerShell Script Block Logging" },
            { 7045, "Service Installed in System" }
        };

        public SecurityEventCollector(ILogger logger)
        {
            _logger = logger;
            // Initialize with current time to avoid collecting historical events on first run
            _lastCollectionTime = DateTime.UtcNow.AddMinutes(-5); // Start from 5 minutes ago
        }

        /// <summary>
        /// Initialize the collector and verify Security Event Log access
        /// </summary>
        public bool Initialize()
        {
            if (_isInitialized)
            {
                return true;
            }

            try
            {
                // Test access to Security Event Log
                using (var eventLog = new EventLog("Security"))
                {
                    // Check if we can read the log
                    var count = eventLog.Entries.Count;
                    _logger.Information("SecurityEventCollector initialized - Security Event Log has {Count} entries", count);
                }

                _isInitialized = true;
                return true;
            }
            catch (System.Security.SecurityException ex)
            {
                _logger.Error(ex, "Access denied to Security Event Log. Agent requires Administrator privileges.");
                return false;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to initialize SecurityEventCollector");
                return false;
            }
        }

        /// <summary>
        /// Collect new security events since last collection
        /// </summary>
        /// <returns>List of security events in JSON format</returns>
        public List<object> CollectEvents()
        {
            if (!_isInitialized && !Initialize())
            {
                _logger.Warning("SecurityEventCollector not initialized - skipping collection");
                return new List<object>();
            }

            var events = new List<object>();

            try
            {
                // Build XPath query to filter by event IDs and time
                var eventIdFilter = string.Join(" or ", _monitoredEventIds.Select(id => $"EventID={id}"));
                var query = $"*[System[({eventIdFilter})]]";

                _logger.Debug("Querying Security Event Log with filter: {Query}", query);

                var queryConfig = new EventLogQuery("Security", PathType.LogName, query);
                
                using (var reader = new EventLogReader(queryConfig))
                {
                    EventRecord eventRecord;
                    int collectedCount = 0;

                    while ((eventRecord = reader.ReadEvent()) != null && collectedCount < _maxBatchSize)
                    {
                        using (eventRecord)
                        {
                            // Only collect events newer than last collection time
                            if (eventRecord.TimeCreated.HasValue && 
                                eventRecord.TimeCreated.Value.ToUniversalTime() > _lastCollectionTime)
                            {
                                try
                                {
                                    var securityEvent = ParseSecurityEvent(eventRecord);
                                    if (securityEvent != null)
                                    {
                                        events.Add(securityEvent);
                                        collectedCount++;
                                    }
                                }
                                catch (Exception ex)
                                {
                                    _logger.Warning(ex, "Failed to parse security event ID {EventId}", eventRecord.Id);
                                }
                            }
                        }

                        // Stop if batch size limit reached
                        if (collectedCount >= _maxBatchSize)
                        {
                            _logger.Debug("Reached batch size limit ({Limit}), stopping collection", _maxBatchSize);
                            break;
                        }
                    }
                }

                // Update last collection time
                if (events.Count > 0)
                {
                    _lastCollectionTime = DateTime.UtcNow;
                    _logger.Information("Collected {Count} security events", events.Count);
                }
                else
                {
                    _logger.Debug("No new security events to collect");
                }
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.Error(ex, "Access denied when reading Security Event Log");
            }
            catch (EventLogException ex)
            {
                _logger.Error(ex, "EventLog error: {Message}", ex.Message);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Unexpected error during security event collection");
            }

            return events;
        }

        /// <summary>
        /// Parse EventRecord into structured security event object
        /// </summary>
        private object? ParseSecurityEvent(EventRecord eventRecord)
        {
            try
            {
                var eventId = eventRecord.Id;
                var timeCreated = eventRecord.TimeCreated?.ToUniversalTime() ?? DateTime.UtcNow;
                
                // Extract core properties
                var securityEvent = new Dictionary<string, object>
                {
                    ["eventId"] = eventId,
                    ["eventType"] = _eventDescriptions.GetValueOrDefault(eventId, $"Unknown Event {eventId}"),
                    ["timestamp"] = timeCreated.ToString("o"),
                    ["computer"] = eventRecord.MachineName ?? Environment.MachineName,
                    ["recordId"] = eventRecord.RecordId ?? 0,
                    ["level"] = eventRecord.Level.HasValue ? GetEventLevelName(eventRecord.Level.Value) : "Information"
                };

                // Extract event data properties
                var properties = new Dictionary<string, string>();
                
                if (eventRecord.Properties != null)
                {
                    for (int i = 0; i < eventRecord.Properties.Count; i++)
                    {
                        try
                        {
                            var value = eventRecord.Properties[i]?.Value?.ToString() ?? "";
                            properties[$"Data_{i}"] = value;
                        }
                        catch
                        {
                            // Skip property if it can't be converted
                        }
                    }
                }

                // Add event-specific parsing based on event ID
                switch (eventId)
                {
                    case 4624: // Successful logon
                    case 4625: // Failed logon
                        ParseLogonEvent(properties, securityEvent);
                        break;

                    case 4648: // Explicit credentials
                        ParseExplicitCredentialsEvent(properties, securityEvent);
                        break;

                    case 4672: // Special privileges
                        ParsePrivilegesEvent(properties, securityEvent);
                        break;

                    case 4720: // User created
                        ParseUserCreatedEvent(properties, securityEvent);
                        break;

                    case 4732: // Group membership
                        ParseGroupMembershipEvent(properties, securityEvent);
                        break;

                    case 4688: // Process created
                        ParseProcessCreatedEvent(properties, securityEvent);
                        break;

                    case 4698: // Scheduled task
                        ParseScheduledTaskEvent(properties, securityEvent);
                        break;

                    case 4104: // PowerShell script
                        ParsePowerShellEvent(properties, securityEvent);
                        break;

                    case 7045: // Service installed
                        ParseServiceInstalledEvent(properties, securityEvent);
                        break;
                }

                // Store raw properties for backend analysis
                securityEvent["properties"] = properties;

                // Get full description if available
                try
                {
                    securityEvent["description"] = eventRecord.FormatDescription() ?? "";
                }
                catch
                {
                    securityEvent["description"] = "";
                }

                return securityEvent;
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to parse event record");
                return null;
            }
        }

        /// <summary>
        /// Parse logon events (4624, 4625)
        /// </summary>
        private void ParseLogonEvent(Dictionary<string, string> properties, Dictionary<string, object> securityEvent)
        {
            // Standard positions for 4624/4625 events
            if (properties.TryGetValue("Data_5", out var username))
                securityEvent["username"] = username;
            
            if (properties.TryGetValue("Data_6", out var domain))
                securityEvent["domain"] = domain;
            
            if (properties.TryGetValue("Data_8", out var logonType))
                securityEvent["logonType"] = logonType;
            
            if (properties.TryGetValue("Data_18", out var sourceIp))
                securityEvent["sourceIp"] = sourceIp;
            
            if (properties.TryGetValue("Data_11", out var workstation))
                securityEvent["workstation"] = workstation;
        }

        /// <summary>
        /// Parse explicit credentials event (4648)
        /// </summary>
        private void ParseExplicitCredentialsEvent(Dictionary<string, string> properties, Dictionary<string, object> securityEvent)
        {
            if (properties.TryGetValue("Data_1", out var subjectUsername))
                securityEvent["subjectUsername"] = subjectUsername;
            
            if (properties.TryGetValue("Data_5", out var targetUsername))
                securityEvent["targetUsername"] = targetUsername;
            
            if (properties.TryGetValue("Data_8", out var processName))
                securityEvent["processName"] = processName;
        }

        /// <summary>
        /// Parse special privileges event (4672)
        /// </summary>
        private void ParsePrivilegesEvent(Dictionary<string, string> properties, Dictionary<string, object> securityEvent)
        {
            if (properties.TryGetValue("Data_1", out var username))
                securityEvent["username"] = username;
            
            if (properties.TryGetValue("Data_2", out var domain))
                securityEvent["domain"] = domain;
        }

        /// <summary>
        /// Parse user created event (4720)
        /// </summary>
        private void ParseUserCreatedEvent(Dictionary<string, string> properties, Dictionary<string, object> securityEvent)
        {
            if (properties.TryGetValue("Data_0", out var targetUsername))
                securityEvent["targetUsername"] = targetUsername;
            
            if (properties.TryGetValue("Data_4", out var subjectUsername))
                securityEvent["subjectUsername"] = subjectUsername;
        }

        /// <summary>
        /// Parse group membership event (4732)
        /// </summary>
        private void ParseGroupMembershipEvent(Dictionary<string, string> properties, Dictionary<string, object> securityEvent)
        {
            if (properties.TryGetValue("Data_0", out var memberName))
                securityEvent["memberName"] = memberName;
            
            if (properties.TryGetValue("Data_2", out var groupName))
                securityEvent["groupName"] = groupName;
        }

        /// <summary>
        /// Parse process created event (4688)
        /// </summary>
        private void ParseProcessCreatedEvent(Dictionary<string, string> properties, Dictionary<string, object> securityEvent)
        {
            if (properties.TryGetValue("Data_5", out var processName))
                securityEvent["processName"] = processName;
            
            if (properties.TryGetValue("Data_6", out var processId))
                securityEvent["processId"] = processId;
            
            if (properties.TryGetValue("Data_8", out var commandLine))
                securityEvent["commandLine"] = commandLine;
            
            if (properties.TryGetValue("Data_13", out var parentProcessName))
                securityEvent["parentProcessName"] = parentProcessName;
        }

        /// <summary>
        /// Parse scheduled task event (4698)
        /// </summary>
        private void ParseScheduledTaskEvent(Dictionary<string, string> properties, Dictionary<string, object> securityEvent)
        {
            if (properties.TryGetValue("Data_1", out var taskName))
                securityEvent["taskName"] = taskName;
            
            if (properties.TryGetValue("Data_0", out var subjectUsername))
                securityEvent["subjectUsername"] = subjectUsername;
        }

        /// <summary>
        /// Parse PowerShell script event (4104)
        /// </summary>
        private void ParsePowerShellEvent(Dictionary<string, string> properties, Dictionary<string, object> securityEvent)
        {
            if (properties.TryGetValue("Data_2", out var scriptBlock))
            {
                // Truncate script block to first 500 characters to avoid huge payloads
                securityEvent["scriptBlock"] = scriptBlock.Length > 500 
                    ? scriptBlock.Substring(0, 500) + "..." 
                    : scriptBlock;
            }
        }

        /// <summary>
        /// Parse service installed event (7045)
        /// </summary>
        private void ParseServiceInstalledEvent(Dictionary<string, string> properties, Dictionary<string, object> securityEvent)
        {
            if (properties.TryGetValue("Data_0", out var serviceName))
                securityEvent["serviceName"] = serviceName;
            
            if (properties.TryGetValue("Data_1", out var imagePath))
                securityEvent["imagePath"] = imagePath;
            
            if (properties.TryGetValue("Data_4", out var accountName))
                securityEvent["accountName"] = accountName;
        }

        /// <summary>
        /// Get human-readable event level name
        /// </summary>
        private string GetEventLevelName(byte level)
        {
            return level switch
            {
                1 => "Critical",
                2 => "Error",
                3 => "Warning",
                4 => "Information",
                5 => "Verbose",
                _ => "Unknown"
            };
        }

        /// <summary>
        /// Reset collection timestamp (useful for testing or manual resets)
        /// </summary>
        public void ResetCollectionTime()
        {
            _lastCollectionTime = DateTime.UtcNow.AddMinutes(-5);
            _logger.Information("Security event collection timestamp reset");
        }

        public void Dispose()
        {
            // Cleanup if needed
            _logger.Information("SecurityEventCollector disposed");
        }
    }
}
