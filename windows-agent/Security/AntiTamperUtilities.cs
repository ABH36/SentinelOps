using System.Diagnostics;
using System.Runtime.InteropServices;

namespace SentinelOpsAgent.Security;

/// <summary>
/// Anti-tamper and anti-debugging utilities to detect attempts to manipulate the agent.
/// 
/// Security Features:
/// - Debugger detection (managed and native)
/// - Process tampering detection
/// - Remote debugger detection
/// - Timing-based debugger detection
/// 
/// Note: These checks are deterrents, not foolproof protection.
/// Determined attackers can bypass them, but they increase the attack cost.
/// </summary>
public static class AntiTamperUtilities
{
    [DllImport("kernel32.dll", SetLastError = true, ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CheckRemoteDebuggerPresent(IntPtr hProcess, ref bool isDebuggerPresent);

    [DllImport("kernel32.dll", SetLastError = true, ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsDebuggerPresent();

    /// <summary>
    /// Check if a debugger is attached to the current process.
    /// Combines multiple detection methods for increased reliability.
    /// </summary>
    /// <returns>True if debugger detected, false otherwise</returns>
    public static bool IsDebuggerAttached()
    {
        try
        {
            // Method 1: Managed debugger check
            if (Debugger.IsAttached)
            {
                return true;
            }

            // Method 2: Native debugger check (Win32 API)
            if (IsDebuggerPresent())
            {
                return true;
            }

            // Method 3: Remote debugger check
            bool isRemoteDebuggerPresent = false;
            CheckRemoteDebuggerPresent(Process.GetCurrentProcess().Handle, ref isRemoteDebuggerPresent);
            if (isRemoteDebuggerPresent)
            {
                return true;
            }

            // Method 4: Timing-based detection (debugger slows down execution)
            var sw = Stopwatch.StartNew();
            Thread.Sleep(1); // Should take ~1ms
            sw.Stop();
            if (sw.ElapsedMilliseconds > 10) // Threshold: 10x slower than expected
            {
                return true;
            }

            return false;
        }
        catch
        {
            // If any check fails, assume debugger present (fail-secure)
            return true;
        }
    }

    /// <summary>
    /// Check if the process is running with elevated privileges (Administrator).
    /// </summary>
    public static bool IsRunningAsAdmin()
    {
        try
        {
            using var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
            var principal = new System.Security.Principal.WindowsPrincipal(identity);
            return principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Check if the process is running as SYSTEM account.
    /// </summary>
    public static bool IsRunningAsSystem()
    {
        try
        {
            using var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
            return identity.IsSystem;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Get the parent process ID.
    /// Useful for detecting if launched by suspicious parent (e.g., debugger, script).
    /// </summary>
    public static int GetParentProcessId()
    {
        try
        {
            var myId = Environment.ProcessId;
            var query = $"SELECT ParentProcessId FROM Win32_Process WHERE ProcessId = {myId}";
            using var searcher = new System.Management.ManagementObjectSearcher(query);
            using var results = searcher.Get().GetEnumerator();
            
            if (results.MoveNext())
            {
                return Convert.ToInt32(results.Current["ParentProcessId"]);
            }

            return -1;
        }
        catch
        {
            return -1;
        }
    }

    /// <summary>
    /// Get the parent process name.
    /// </summary>
    public static string GetParentProcessName()
    {
        try
        {
            var parentId = GetParentProcessId();
            if (parentId <= 0)
            {
                return "Unknown";
            }

            var parent = Process.GetProcessById(parentId);
            return parent.ProcessName;
        }
        catch
        {
            return "Unknown";
        }
    }

    /// <summary>
    /// Check if the current executable has been modified (basic integrity check).
    /// Compares file size and last write time against expected values.
    /// </summary>
    public static bool IsExecutableModified(long expectedSize, DateTime expectedLastWriteTime)
    {
        try
        {
            var exePath = Environment.ProcessPath;
            if (string.IsNullOrEmpty(exePath) || !File.Exists(exePath))
            {
                return true; // Suspicious: can't find own executable
            }

            var fileInfo = new FileInfo(exePath);
            
            // Check file size
            if (fileInfo.Length != expectedSize)
            {
                return true;
            }

            // Check last write time (within 1 minute tolerance)
            var timeDiff = Math.Abs((fileInfo.LastWriteTimeUtc - expectedLastWriteTime).TotalMinutes);
            if (timeDiff > 1)
            {
                return true;
            }

            return false;
        }
        catch
        {
            return true; // Fail-secure: assume modified if check fails
        }
    }

    /// <summary>
    /// Obfuscated sleep to make timing-based analysis harder.
    /// </summary>
    public static void ObfuscatedDelay(int milliseconds)
    {
        var random = new Random();
        var jitter = random.Next(-50, 50);
        var actualDelay = Math.Max(0, milliseconds + jitter);
        Thread.Sleep(actualDelay);
    }
}
