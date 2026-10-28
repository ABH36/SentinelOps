using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Serilog;
using SentinelOpsAgent.Storage;

namespace SentinelOpsAgent.Activity
{
    /// <summary>
    /// Monitors clipboard content changes for security and compliance purposes.
    /// Runs on STA thread to properly handle Windows clipboard API.
    /// </summary>
    public class ClipboardMonitor : IDisposable
    {
        private readonly ILogger _logger;
        private readonly OfflineBuffer _offlineBuffer;
        private Thread? _clipboardThread;
        private ClipboardWindow? _clipboardWindow;
        private bool _isRunning;
        private readonly int _maxContentLength = 2048; // 2KB max capture

        // Win32 API declarations
        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool AddClipboardFormatListener(IntPtr hwnd);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool RemoveClipboardFormatListener(IntPtr hwnd);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

        private const int WM_CLIPBOARDUPDATE = 0x031D;

        public ClipboardMonitor(ILogger logger, OfflineBuffer offlineBuffer)
        {
            _logger = logger;
            _offlineBuffer = offlineBuffer;
        }

        /// <summary>
        /// Start clipboard monitoring on a dedicated STA thread
        /// </summary>
        public void Start()
        {
            if (_isRunning)
            {
                _logger.Warning("ClipboardMonitor already running");
                return;
            }

            _isRunning = true;

            // Create STA thread for clipboard monitoring
            _clipboardThread = new Thread(RunClipboardMonitor)
            {
                IsBackground = true,
                Name = "ClipboardMonitorThread"
            };
            _clipboardThread.SetApartmentState(ApartmentState.STA);
            _clipboardThread.Start();

            _logger.Information("ClipboardMonitor started on STA thread");
        }

        /// <summary>
        /// Stop clipboard monitoring
        /// </summary>
        public void Stop()
        {
            if (!_isRunning)
            {
                return;
            }

            _isRunning = false;

            if (_clipboardWindow != null)
            {
                _clipboardWindow.Close();
                _clipboardWindow = null;
            }

            if (_clipboardThread != null && _clipboardThread.IsAlive)
            {
                _clipboardThread.Join(TimeSpan.FromSeconds(5));
            }

            _logger.Information("ClipboardMonitor stopped");
        }

        /// <summary>
        /// STA thread entry point - creates hidden window and message loop
        /// </summary>
        private void RunClipboardMonitor()
        {
            try
            {
                _logger.Information("Starting clipboard monitor message loop");

                // Create hidden window to receive clipboard notifications
                _clipboardWindow = new ClipboardWindow(this, _logger);
                
                // Register for clipboard format listener
                if (!AddClipboardFormatListener(_clipboardWindow.Handle))
                {
                    var error = Marshal.GetLastWin32Error();
                    _logger.Error("Failed to add clipboard format listener. Error code: {ErrorCode}", error);
                    return;
                }

                _logger.Information("Clipboard format listener registered successfully");

                // Run message loop
                Application.Run(_clipboardWindow);

                // Cleanup
                RemoveClipboardFormatListener(_clipboardWindow.Handle);
                _logger.Information("Clipboard monitor message loop exited");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Clipboard monitor thread error");
            }
        }

        /// <summary>
        /// Handle clipboard update notification
        /// </summary>
        private void OnClipboardChanged()
        {
            try
            {
                // Check if clipboard contains text
                if (!Clipboard.ContainsText())
                {
                    return;
                }

                // Get clipboard text content
                string clipboardText = Clipboard.GetText();

                if (string.IsNullOrEmpty(clipboardText))
                {
                    return;
                }

                // Truncate if exceeds max length
                int originalLength = clipboardText.Length;
                bool wasTruncated = false;

                if (clipboardText.Length > _maxContentLength)
                {
                    clipboardText = clipboardText.Substring(0, _maxContentLength);
                    wasTruncated = true;
                }

                // Get active process (foreground window)
                string activeProcess = GetActiveProcessName();

                // Create clipboard event
                var clipboardEvent = new
                {
                    content = clipboardText,
                    contentLength = originalLength,
                    truncated = wasTruncated,
                    activeProcess = activeProcess,
                    capturedAt = DateTime.UtcNow.ToString("o")
                };

                // Queue to offline buffer
                _offlineBuffer.Queue("clipboard", clipboardEvent);

                _logger.Debug(
                    "Clipboard content captured - Length: {Length}, Process: {Process}, Truncated: {Truncated}",
                    originalLength,
                    activeProcess,
                    wasTruncated
                );
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to capture clipboard content");
            }
        }

        /// <summary>
        /// Get the name of the active (foreground) process
        /// </summary>
        private string GetActiveProcessName()
        {
            try
            {
                IntPtr foregroundWindow = GetForegroundWindow();

                if (foregroundWindow == IntPtr.Zero)
                {
                    return "Unknown";
                }

                GetWindowThreadProcessId(foregroundWindow, out uint processId);

                if (processId == 0)
                {
                    return "Unknown";
                }

                using (var process = Process.GetProcessById((int)processId))
                {
                    return process.ProcessName;
                }
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to get active process name");
                return "Unknown";
            }
        }

        public void Dispose()
        {
            Stop();
        }

        /// <summary>
        /// Hidden window class to receive clipboard notifications
        /// </summary>
        private class ClipboardWindow : Form
        {
            private readonly ClipboardMonitor _monitor;
            private readonly ILogger _logger;

            public ClipboardWindow(ClipboardMonitor monitor, ILogger logger)
            {
                _monitor = monitor;
                _logger = logger;

                // Create hidden window
                this.FormBorderStyle = FormBorderStyle.None;
                this.ShowInTaskbar = false;
                this.WindowState = FormWindowState.Minimized;
                this.Opacity = 0;
                this.Width = 0;
                this.Height = 0;
            }

            /// <summary>
            /// Override WndProc to handle WM_CLIPBOARDUPDATE messages
            /// </summary>
            protected override void WndProc(ref Message m)
            {
                if (m.Msg == WM_CLIPBOARDUPDATE)
                {
                    // Clipboard content changed
                    try
                    {
                        _monitor.OnClipboardChanged();
                    }
                    catch (Exception ex)
                    {
                        _logger.Error(ex, "Error handling clipboard update");
                    }
                }

                base.WndProc(ref m);
            }

            /// <summary>
            /// Prevent window from closing (stops message loop)
            /// </summary>
            protected override void OnFormClosing(FormClosingEventArgs e)
            {
                if (e.CloseReason == CloseReason.UserClosing)
                {
                    e.Cancel = true;
                }
                base.OnFormClosing(e);
            }
        }
    }
}
