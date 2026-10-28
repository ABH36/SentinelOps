using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.Data.Sqlite;
using Serilog;
using SentinelOpsAgent.Storage;

namespace SentinelOpsAgent.Activity
{
    /// <summary>
    /// Collects browser history from Chrome, Edge, and Firefox for security monitoring.
    /// Reads SQLite database files and extracts URL, title, visit count, and last visit time.
    /// </summary>
    public class BrowserHistoryCollector
    {
        private readonly ILogger _logger;
        private readonly OfflineBuffer _offlineBuffer;
        private readonly int _maxEntriesPerBrowser = 500;

        public BrowserHistoryCollector(ILogger logger, OfflineBuffer offlineBuffer)
        {
            _logger = logger;
            _offlineBuffer = offlineBuffer;
        }

        /// <summary>
        /// Collect browser history from all supported browsers
        /// </summary>
        public void CollectAll()
        {
            try
            {
                _logger.Information("Starting browser history collection");

                var allEntries = new List<BrowserHistoryEntry>();

                // Collect from each browser
                var chromeEntries = CollectChromeHistory();
                var edgeEntries = CollectEdgeHistory();
                var firefoxEntries = CollectFirefoxHistory();

                allEntries.AddRange(chromeEntries);
                allEntries.AddRange(edgeEntries);
                allEntries.AddRange(firefoxEntries);

                _logger.Information(
                    "Browser history collection complete - Chrome: {ChromeCount}, Edge: {EdgeCount}, Firefox: {FirefoxCount}, Total: {TotalCount}",
                    chromeEntries.Count,
                    edgeEntries.Count,
                    firefoxEntries.Count,
                    allEntries.Count
                );

                // Queue to offline buffer
                if (allEntries.Any())
                {
                    _offlineBuffer.Queue("browser_history", new
                    {
                        entries = allEntries,
                        collectedAt = DateTime.UtcNow.ToString("o"),
                        totalEntries = allEntries.Count
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Browser history collection failed");
            }
        }

        /// <summary>
        /// Collect Chrome browser history
        /// </summary>
        private List<BrowserHistoryEntry> CollectChromeHistory()
        {
            var entries = new List<BrowserHistoryEntry>();

            try
            {
                var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                var historyPath = Path.Combine(
                    userProfile,
                    "AppData", "Local", "Google", "Chrome", "User Data", "Default", "History"
                );

                if (!File.Exists(historyPath))
                {
                    _logger.Debug("Chrome history file not found: {Path}", historyPath);
                    return entries;
                }

                entries = ReadChromeEdgeHistory(historyPath, "Chrome");
                _logger.Information("Collected {Count} Chrome history entries", entries.Count);
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to collect Chrome history");
            }

            return entries;
        }

        /// <summary>
        /// Collect Edge browser history
        /// </summary>
        private List<BrowserHistoryEntry> CollectEdgeHistory()
        {
            var entries = new List<BrowserHistoryEntry>();

            try
            {
                var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                var historyPath = Path.Combine(
                    userProfile,
                    "AppData", "Local", "Microsoft", "Edge", "User Data", "Default", "History"
                );

                if (!File.Exists(historyPath))
                {
                    _logger.Debug("Edge history file not found: {Path}", historyPath);
                    return entries;
                }

                entries = ReadChromeEdgeHistory(historyPath, "Edge");
                _logger.Information("Collected {Count} Edge history entries", entries.Count);
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to collect Edge history");
            }

            return entries;
        }

        /// <summary>
        /// Collect Firefox browser history
        /// </summary>
        private List<BrowserHistoryEntry> CollectFirefoxHistory()
        {
            var entries = new List<BrowserHistoryEntry>();

            try
            {
                var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                var firefoxProfilesPath = Path.Combine(userProfile, "Mozilla", "Firefox", "Profiles");

                if (!Directory.Exists(firefoxProfilesPath))
                {
                    _logger.Debug("Firefox profiles directory not found: {Path}", firefoxProfilesPath);
                    return entries;
                }

                // Firefox may have multiple profiles
                var profileDirs = Directory.GetDirectories(firefoxProfilesPath);

                foreach (var profileDir in profileDirs)
                {
                    var placesDbPath = Path.Combine(profileDir, "places.sqlite");

                    if (File.Exists(placesDbPath))
                    {
                        var profileEntries = ReadFirefoxHistory(placesDbPath);
                        entries.AddRange(profileEntries);
                        _logger.Debug("Collected {Count} entries from Firefox profile: {Profile}",
                            profileEntries.Count, Path.GetFileName(profileDir));
                    }
                }

                _logger.Information("Collected {Count} Firefox history entries across all profiles", entries.Count);
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to collect Firefox history");
            }

            return entries;
        }

        /// <summary>
        /// Read Chrome or Edge history database (both use same schema)
        /// </summary>
        private List<BrowserHistoryEntry> ReadChromeEdgeHistory(string historyPath, string browserName)
        {
            var entries = new List<BrowserHistoryEntry>();

            // Create temporary copy because browser may have file locked
            var tempPath = Path.Combine(Path.GetTempPath(), $"history_temp_{Guid.NewGuid()}.db");

            try
            {
                // Copy to temp location
                File.Copy(historyPath, tempPath, overwrite: true);

                using (var connection = new SqliteConnection($"Data Source={tempPath};Mode=ReadOnly"))
                {
                    connection.Open();

                    var command = connection.CreateCommand();
                    command.CommandText = @"
                        SELECT url, title, visit_count, last_visit_time
                        FROM urls
                        WHERE visit_count > 0
                        ORDER BY last_visit_time DESC
                        LIMIT @limit
                    ";
                    command.Parameters.AddWithValue("@limit", _maxEntriesPerBrowser);

                    using (var reader = command.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            try
                            {
                                var url = reader.GetString(0);
                                var title = reader.IsDBNull(1) ? "" : reader.GetString(1);
                                var visitCount = reader.GetInt32(2);
                                var lastVisitTime = reader.GetInt64(3);

                                // Chrome/Edge stores time as microseconds since 1601-01-01
                                var lastVisit = ConvertChromeTime(lastVisitTime);

                                entries.Add(new BrowserHistoryEntry
                                {
                                    Browser = browserName,
                                    Url = url,
                                    Title = title,
                                    VisitCount = visitCount,
                                    LastVisit = lastVisit
                                });
                            }
                            catch (Exception ex)
                            {
                                _logger.Warning(ex, "Failed to parse history entry");
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to read {Browser} history database", browserName);
            }
            finally
            {
                // Cleanup temp file
                try
                {
                    if (File.Exists(tempPath))
                    {
                        File.Delete(tempPath);
                    }
                }
                catch { }
            }

            return entries;
        }

        /// <summary>
        /// Read Firefox history database
        /// </summary>
        private List<BrowserHistoryEntry> ReadFirefoxHistory(string placesDbPath)
        {
            var entries = new List<BrowserHistoryEntry>();

            // Create temporary copy
            var tempPath = Path.Combine(Path.GetTempPath(), $"places_temp_{Guid.NewGuid()}.sqlite");

            try
            {
                File.Copy(placesDbPath, tempPath, overwrite: true);

                using (var connection = new SqliteConnection($"Data Source={tempPath};Mode=ReadOnly"))
                {
                    connection.Open();

                    var command = connection.CreateCommand();
                    command.CommandText = @"
                        SELECT url, title, visit_count, last_visit_date
                        FROM moz_places
                        WHERE visit_count > 0
                        ORDER BY last_visit_date DESC
                        LIMIT @limit
                    ";
                    command.Parameters.AddWithValue("@limit", _maxEntriesPerBrowser);

                    using (var reader = command.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            try
                            {
                                var url = reader.GetString(0);
                                var title = reader.IsDBNull(1) ? "" : reader.GetString(1);
                                var visitCount = reader.GetInt32(2);
                                var lastVisitDate = reader.IsDBNull(3) ? 0 : reader.GetInt64(3);

                                // Firefox stores time as microseconds since Unix epoch
                                var lastVisit = ConvertFirefoxTime(lastVisitDate);

                                entries.Add(new BrowserHistoryEntry
                                {
                                    Browser = "Firefox",
                                    Url = url,
                                    Title = title,
                                    VisitCount = visitCount,
                                    LastVisit = lastVisit
                                });
                            }
                            catch (Exception ex)
                            {
                                _logger.Warning(ex, "Failed to parse Firefox history entry");
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to read Firefox history database");
            }
            finally
            {
                // Cleanup temp file
                try
                {
                    if (File.Exists(tempPath))
                    {
                        File.Delete(tempPath);
                    }
                }
                catch { }
            }

            return entries;
        }

        /// <summary>
        /// Convert Chrome/Edge timestamp to DateTime
        /// Chrome stores time as microseconds since 1601-01-01 00:00:00 UTC
        /// </summary>
        private DateTime ConvertChromeTime(long chromeTime)
        {
            try
            {
                if (chromeTime == 0) return DateTime.MinValue;

                var epoch = new DateTime(1601, 1, 1, 0, 0, 0, DateTimeKind.Utc);
                return epoch.AddTicks(chromeTime * 10); // Convert microseconds to ticks (100ns)
            }
            catch
            {
                return DateTime.MinValue;
            }
        }

        /// <summary>
        /// Convert Firefox timestamp to DateTime
        /// Firefox stores time as microseconds since Unix epoch (1970-01-01)
        /// </summary>
        private DateTime ConvertFirefoxTime(long firefoxTime)
        {
            try
            {
                if (firefoxTime == 0) return DateTime.MinValue;

                var epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
                return epoch.AddTicks(firefoxTime * 10); // Convert microseconds to ticks
            }
            catch
            {
                return DateTime.MinValue;
            }
        }
    }

    /// <summary>
    /// Browser history entry data model
    /// </summary>
    public class BrowserHistoryEntry
    {
        public string Browser { get; set; }
        public string Url { get; set; }
        public string Title { get; set; }
        public int VisitCount { get; set; }
        public DateTime LastVisit { get; set; }
    }
}
