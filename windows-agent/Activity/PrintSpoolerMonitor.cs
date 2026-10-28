using System;
using System.Collections.Generic;
using System.Management;
using System.Linq;
using Serilog;

namespace SentinelOpsAgent.Activity
{
    /// <summary>
    /// Monitors Windows print spooler for print job events
    /// Captures document name, printer, pages, and user for DLP enforcement
    /// </summary>
    public class PrintSpoolerMonitor : IDisposable
    {
        private readonly ILogger _logger;
        private ManagementEventWatcher _printJobWatcher;
        private bool _isMonitoring;
        private readonly object _lockObject = new object();

        public PrintSpoolerMonitor()
        {
            _logger = Log.ForContext<PrintSpoolerMonitor>();
        }

        /// <summary>
        /// Start monitoring print spooler events
        /// </summary>
        public void StartMonitoring(Action<PrintJobEvent> onPrintJob)
        {
            lock (_lockObject)
            {
                if (_isMonitoring)
                {
                    _logger.Warning("Print spooler monitor is already running");
                    return;
                }

                try
                {
                    // WMI query to watch for Win32_PrintJob creation events
                    var query = new WqlEventQuery(
                        "SELECT * FROM __InstanceCreationEvent WITHIN 1 " +
                        "WHERE TargetInstance ISA 'Win32_PrintJob'"
                    );

                    _printJobWatcher = new ManagementEventWatcher(query);

                    _printJobWatcher.EventArrived += (sender, e) =>
                    {
                        try
                        {
                            var targetInstance = (ManagementBaseObject)e.NewEvent["TargetInstance"];
                            
                            if (targetInstance != null)
                            {
                                var printJobEvent = ParsePrintJobEvent(targetInstance);
                                
                                if (printJobEvent != null)
                                {
                                    _logger.Information(
                                        "Print job detected: {Document} by {Owner} on {Printer} ({Pages} pages)",
                                        printJobEvent.DocumentName,
                                        printJobEvent.Owner,
                                        printJobEvent.PrinterName,
                                        printJobEvent.TotalPages
                                    );

                                    onPrintJob?.Invoke(printJobEvent);
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.Error(ex, "Error processing print job event");
                        }
                    };

                    _printJobWatcher.Start();
                    _isMonitoring = true;

                    _logger.Information("Print spooler monitor started successfully");
                }
                catch (Exception ex)
                {
                    _logger.Error(ex, "Failed to start print spooler monitor");
                    throw;
                }
            }
        }

        /// <summary>
        /// Stop monitoring print spooler events
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
                    _printJobWatcher?.Stop();
                    _printJobWatcher?.Dispose();
                    _printJobWatcher = null;
                    _isMonitoring = false;

                    _logger.Information("Print spooler monitor stopped");
                }
                catch (Exception ex)
                {
                    _logger.Error(ex, "Error stopping print spooler monitor");
                }
            }
        }

        /// <summary>
        /// Parse Win32_PrintJob WMI object into PrintJobEvent
        /// </summary>
        private PrintJobEvent ParsePrintJobEvent(ManagementBaseObject job)
        {
            try
            {
                // Extract print job properties
                var jobId = Convert.ToInt32(job["JobId"] ?? 0);
                var documentName = job["Document"]?.ToString() ?? "Unknown";
                var printerName = job["Name"]?.ToString() ?? "Unknown";
                var owner = job["Owner"]?.ToString() ?? "Unknown";
                var totalPages = Convert.ToInt32(job["TotalPages"] ?? 0);
                var jobStatus = job["JobStatus"]?.ToString() ?? "Unknown";
                var dataType = job["DataType"]?.ToString() ?? "Unknown";
                var driverName = job["DriverName"]?.ToString() ?? "Unknown";
                
                // TimeSubmitted is a WMI datetime string (yyyyMMddHHmmss.mmmmmm+UUU)
                var timeSubmitted = DateTime.UtcNow;
                try
                {
                    var timeSubmittedStr = job["TimeSubmitted"]?.ToString();
                    if (!string.IsNullOrEmpty(timeSubmittedStr))
                    {
                        timeSubmitted = ManagementDateTimeConverter.ToDateTime(timeSubmittedStr).ToUniversalTime();
                    }
                }
                catch
                {
                    // Use current time if parsing fails
                    timeSubmitted = DateTime.UtcNow;
                }

                // Calculate file size if available (in bytes)
                long fileSize = 0;
                try
                {
                    fileSize = Convert.ToInt64(job["Size"] ?? 0);
                }
                catch
                {
                    // Size may not be available for all print jobs
                }

                return new PrintJobEvent
                {
                    JobId = jobId,
                    DocumentName = documentName,
                    PrinterName = printerName,
                    Owner = owner,
                    TotalPages = totalPages,
                    JobStatus = jobStatus,
                    DataType = dataType,
                    DriverName = driverName,
                    FileSize = fileSize,
                    TimeSubmitted = timeSubmitted,
                    DetectedAt = DateTime.UtcNow
                };
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error parsing print job event");
                return null;
            }
        }

        /// <summary>
        /// Get current print jobs from spooler (for initial snapshot)
        /// </summary>
        public List<PrintJobEvent> GetCurrentPrintJobs()
        {
            var printJobs = new List<PrintJobEvent>();

            try
            {
                var searcher = new ManagementObjectSearcher(
                    "SELECT * FROM Win32_PrintJob"
                );

                foreach (ManagementObject job in searcher.Get())
                {
                    var printJobEvent = ParsePrintJobEvent(job);
                    if (printJobEvent != null)
                    {
                        printJobs.Add(printJobEvent);
                    }
                }

                _logger.Information("Retrieved {Count} current print jobs", printJobs.Count);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error retrieving current print jobs");
            }

            return printJobs;
        }

        public void Dispose()
        {
            StopMonitoring();
        }
    }

    /// <summary>
    /// Represents a print job event
    /// </summary>
    public class PrintJobEvent
    {
        /// <summary>
        /// Print job ID from Windows spooler
        /// </summary>
        public int JobId { get; set; }

        /// <summary>
        /// Name of the document being printed
        /// </summary>
        public string DocumentName { get; set; }

        /// <summary>
        /// Name of the printer
        /// </summary>
        public string PrinterName { get; set; }

        /// <summary>
        /// User who initiated the print job (domain\username)
        /// </summary>
        public string Owner { get; set; }

        /// <summary>
        /// Total number of pages in the print job
        /// </summary>
        public int TotalPages { get; set; }

        /// <summary>
        /// Print job status (e.g., "Printing", "Spooling", "Paused")
        /// </summary>
        public string JobStatus { get; set; }

        /// <summary>
        /// Data type of the print job (e.g., "RAW", "TEXT")
        /// </summary>
        public string DataType { get; set; }

        /// <summary>
        /// Printer driver name
        /// </summary>
        public string DriverName { get; set; }

        /// <summary>
        /// File size in bytes (if available)
        /// </summary>
        public long FileSize { get; set; }

        /// <summary>
        /// When the print job was submitted to the spooler
        /// </summary>
        public DateTime TimeSubmitted { get; set; }

        /// <summary>
        /// When the agent detected this print job
        /// </summary>
        public DateTime DetectedAt { get; set; }
    }
}
