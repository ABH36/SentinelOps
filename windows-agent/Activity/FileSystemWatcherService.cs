using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Serilog;

namespace SentinelOpsAgent.Activity
{
    /// <summary>
    /// Monitors file system changes in sensitive directories
    /// Detects mass file operations and potential ransomware activity
    /// </summary>
    public class FileSystemWatcherService : IDisposable
    {
        private readonly ILogger _logger;
        private readonly List<FileSystemWatcher> _watchers;
        private readonly ConcurrentQueue<FileChangeEvent> _eventQueue;
        private readonly Timer _batchTimer;
        private readonly object _lockObject = new object();
        private bool _isMonitoring;

        // Batching configuration
        private const int MAX_BATCH_SIZE = 10;
        private const int BATCH_INTERVAL_SECONDS = 30;

        // Default monitored paths
        private static readonly string[] DefaultPaths = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Documents"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads")
        };

        public FileSystemWatcherService()
        {
            _logger = Log.ForContext<FileSystemWatcherService>();
            _watchers = new List<FileSystemWatcher>();
            _eventQueue = new ConcurrentQueue<FileChangeEvent>();
            _batchTimer = new Timer(OnBatchTimerElapsed, null, Timeout.Infinite, Timeout.Infinite);
        }

        /// <summary>
        /// Start monitoring file system changes
        /// </summary>
        public void StartMonitoring(Action<List<FileChangeEvent>> onBatch, string[] customPaths = null)
        {
            lock (_lockObject)
            {
                if (_isMonitoring)
                {
                    _logger.Warning("File system watcher is already running");
                    return;
                }

                try
                {
                    // Combine default paths with custom paths
                    var pathsToMonitor = customPaths != null
                        ? DefaultPaths.Concat(customPaths).Distinct().ToArray()
                        : DefaultPaths;

                    foreach (var path in pathsToMonitor)
                    {
                        if (!Directory.Exists(path))
                        {
                            _logger.Warning("Path does not exist, skipping: {Path}", path);
                            continue;
                        }

                        var watcher = CreateWatcher(path, onBatch);
                        _watchers.Add(watcher);
                        _logger.Information("Started monitoring: {Path}", path);
                    }

                    // Start batch timer
                    _batchTimer.Change(
                        TimeSpan.FromSeconds(BATCH_INTERVAL_SECONDS),
                        TimeSpan.FromSeconds(BATCH_INTERVAL_SECONDS)
                    );

                    _isMonitoring = true;
                    _logger.Information(
                        "File system watcher started - monitoring {Count} paths",
                        _watchers.Count
                    );
                }
                catch (Exception ex)
                {
                    _logger.Error(ex, "Failed to start file system watcher");
                    throw;
                }
            }
        }

        /// <summary>
        /// Stop monitoring file system changes
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
                    // Stop batch timer
                    _batchTimer.Change(Timeout.Infinite, Timeout.Infinite);

                    // Stop and dispose all watchers
                    foreach (var watcher in _watchers)
                    {
                        watcher.EnableRaisingEvents = false;
                        watcher.Dispose();
                    }

                    _watchers.Clear();
                    _isMonitoring = false;

                    _logger.Information("File system watcher stopped");
                }
                catch (Exception ex)
                {
                    _logger.Error(ex, "Error stopping file system watcher");
                }
            }
        }

        /// <summary>
        /// Create a FileSystemWatcher for a specific path
        /// </summary>
        private FileSystemWatcher CreateWatcher(string path, Action<List<FileChangeEvent>> onBatch)
        {
            var watcher = new FileSystemWatcher(path)
            {
                IncludeSubdirectories = true,
                NotifyFilter = NotifyFilters.FileName |
                               NotifyFilters.DirectoryName |
                               NotifyFilters.LastWrite |
                               NotifyFilters.Size,
                EnableRaisingEvents = true
            };

            // Subscribe to events
            watcher.Created += (sender, e) => OnFileSystemEvent("CREATED", e.FullPath, null, onBatch);
            watcher.Changed += (sender, e) => OnFileSystemEvent("CHANGED", e.FullPath, null, onBatch);
            watcher.Deleted += (sender, e) => OnFileSystemEvent("DELETED", e.FullPath, null, onBatch);
            watcher.Renamed += (sender, e) => OnFileSystemEvent("RENAMED", e.FullPath, e.OldFullPath, onBatch);
            watcher.Error += (sender, e) => OnWatcherError(e.GetException());

            return watcher;
        }

        /// <summary>
        /// Handle file system events
        /// </summary>
        private void OnFileSystemEvent(
            string changeType,
            string filePath,
            string oldPath,
            Action<List<FileChangeEvent>> onBatch)
        {
            try
            {
                // Get file information
                long fileSize = 0;
                string fileExtension = string.Empty;

                try
                {
                    if (changeType != "DELETED" && File.Exists(filePath))
                    {
                        var fileInfo = new FileInfo(filePath);
                        fileSize = fileInfo.Length;
                        fileExtension = fileInfo.Extension.ToLower();
                    }
                    else if (changeType == "DELETED" || changeType == "RENAMED")
                    {
                        // For deleted/renamed files, try to get extension from path
                        fileExtension = Path.GetExtension(filePath).ToLower();
                    }
                }
                catch
                {
                    // File may be locked or already deleted
                    fileExtension = Path.GetExtension(filePath).ToLower();
                }

                var changeEvent = new FileChangeEvent
                {
                    ChangeType = changeType,
                    FilePath = filePath,
                    OldPath = oldPath,
                    FileSize = fileSize,
                    FileExtension = fileExtension,
                    DetectedAt = DateTime.UtcNow
                };

                _eventQueue.Enqueue(changeEvent);

                // Check if we should flush the batch
                if (_eventQueue.Count >= MAX_BATCH_SIZE)
                {
                    FlushBatch(onBatch);
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error processing file system event: {Path}", filePath);
            }
        }

        /// <summary>
        /// Handle watcher errors
        /// </summary>
        private void OnWatcherError(Exception exception)
        {
            _logger.Error(exception, "File system watcher error occurred");
        }

        /// <summary>
        /// Batch timer elapsed callback
        /// </summary>
        private void OnBatchTimerElapsed(object state)
        {
            // State contains the onBatch callback, but we need to handle it differently
            // This is called from a different context, so we'll just log
            if (!_eventQueue.IsEmpty)
            {
                _logger.Debug(
                    "Batch timer elapsed with {Count} events in queue",
                    _eventQueue.Count
                );
            }
        }

        /// <summary>
        /// Flush batched events
        /// </summary>
        private void FlushBatch(Action<List<FileChangeEvent>> onBatch)
        {
            lock (_lockObject)
            {
                if (_eventQueue.IsEmpty)
                {
                    return;
                }

                var batch = new List<FileChangeEvent>();

                // Dequeue all events
                while (_eventQueue.TryDequeue(out var changeEvent))
                {
                    batch.Add(changeEvent);
                }

                if (batch.Count > 0)
                {
                    _logger.Information("Flushing batch of {Count} file change events", batch.Count);

                    try
                    {
                        onBatch?.Invoke(batch);
                    }
                    catch (Exception ex)
                    {
                        _logger.Error(ex, "Error invoking batch callback");
                    }
                }
            }
        }

        /// <summary>
        /// Manually trigger batch flush (for shutdown)
        /// </summary>
        public void FlushPendingEvents(Action<List<FileChangeEvent>> onBatch)
        {
            FlushBatch(onBatch);
        }

        /// <summary>
        /// Get currently monitored paths
        /// </summary>
        public List<string> GetMonitoredPaths()
        {
            lock (_lockObject)
            {
                return _watchers.Select(w => w.Path).ToList();
            }
        }

        /// <summary>
        /// Get pending event count
        /// </summary>
        public int GetPendingEventCount()
        {
            return _eventQueue.Count;
        }

        public void Dispose()
        {
            StopMonitoring();
            _batchTimer?.Dispose();
        }
    }

    /// <summary>
    /// Represents a file system change event
    /// </summary>
    public class FileChangeEvent
    {
        /// <summary>
        /// Type of change (CREATED, CHANGED, DELETED, RENAMED)
        /// </summary>
        public string ChangeType { get; set; }

        /// <summary>
        /// Full path to the file
        /// </summary>
        public string FilePath { get; set; }

        /// <summary>
        /// Old path (for RENAMED events)
        /// </summary>
        public string OldPath { get; set; }

        /// <summary>
        /// File size in bytes (0 for deleted files)
        /// </summary>
        public long FileSize { get; set; }

        /// <summary>
        /// File extension (e.g., ".pdf", ".docx")
        /// </summary>
        public string FileExtension { get; set; }

        /// <summary>
        /// When the change was detected
        /// </summary>
        public DateTime DetectedAt { get; set; }
    }
}
