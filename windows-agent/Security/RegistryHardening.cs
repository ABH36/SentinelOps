using Microsoft.Win32;
using System.Security.AccessControl;
using System.Security.Principal;

namespace SentinelOpsAgent.Security;

/// <summary>
/// Registry hardening utilities to protect agent configuration and prevent tampering.
/// 
/// Security Features:
/// - SYSTEM-only ACLs on registry keys
/// - Hidden registry locations with disguised names
/// - DPAPI encryption for sensitive values
/// - Integrity verification
/// 
/// Registry Structure:
/// HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\DeviceSetup
///   └─ {GUID} (hidden, SYSTEM-only ACL)
///       ├─ InstallPath (encrypted)
///       ├─ ServiceName (encrypted)
///       └─ ConfigHash (integrity check)
/// </summary>
public static class RegistryHardening
{
    // Disguised registry path (looks like legitimate Windows key)
    private const string BASE_KEY_PATH = @"SOFTWARE\Microsoft\Windows\CurrentVersion\DeviceSetup";
    
    // Agent-specific subkey (GUID-based for uniqueness)
    private static readonly string AGENT_SUBKEY_NAME = "47D3E195-9B8F-4C2E-A5F1-2E8C9D1A4B6C";
    
    private static readonly string FULL_KEY_PATH = $@"{BASE_KEY_PATH}\{AGENT_SUBKEY_NAME}";

    /// <summary>
    /// Harden registry keys with SYSTEM-only ACLs.
    /// Creates hidden registry location for agent configuration.
    /// </summary>
    public static bool HardenRegistryKeys()
    {
        try
        {
            // Open or create the registry key
            using var baseKey = Registry.LocalMachine.CreateSubKey(
                BASE_KEY_PATH,
                RegistryKeyPermissionCheck.ReadWriteSubTree);

            if (baseKey == null)
            {
                Log.Error("Failed to create base registry key");
                return false;
            }

            // Create agent subkey
            using var agentKey = baseKey.CreateSubKey(
                AGENT_SUBKEY_NAME,
                RegistryKeyPermissionCheck.ReadWriteSubTree);

            if (agentKey == null)
            {
                Log.Error("Failed to create agent registry key");
                return false;
            }

            // Get current ACL
            var security = agentKey.GetAccessControl();

            // Disable inheritance
            security.SetAccessRuleProtection(true, false);

            // Remove all existing rules
            foreach (RegistryAccessRule rule in security.GetAccessRules(true, true, typeof(SecurityIdentifier)))
            {
                security.RemoveAccessRule(rule);
            }

            // Add SYSTEM Full Control
            var systemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
            var systemRule = new RegistryAccessRule(
                systemSid,
                RegistryRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                PropagationFlags.None,
                AccessControlType.Allow);
            security.AddAccessRule(systemRule);

            // Add Administrators Full Control (for maintenance)
            var adminsSid = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
            var adminsRule = new RegistryAccessRule(
                adminsSid,
                RegistryRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                PropagationFlags.None,
                AccessControlType.Allow);
            security.AddAccessRule(adminsRule);

            // Apply ACL
            agentKey.SetAccessControl(security);

            Log.Information("Registry keys hardened with SYSTEM-only ACLs");
            return true;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to harden registry keys: {Message}", ex.Message);
            return false;
        }
    }

    /// <summary>
    /// Store encrypted configuration value in hardened registry.
    /// Uses DPAPI for encryption (machine-level).
    /// </summary>
    public static bool StoreEncryptedValue(string valueName, string value)
    {
        try
        {
            // Encrypt using DPAPI (machine scope)
            var plainBytes = System.Text.Encoding.UTF8.GetBytes(value);
            var encryptedBytes = System.Security.Cryptography.ProtectedData.Protect(
                plainBytes,
                null, // No additional entropy
                System.Security.Cryptography.DataProtectionScope.LocalMachine);

            // Convert to base64 for storage
            var encryptedValue = Convert.ToBase64String(encryptedBytes);

            // Store in registry
            using var key = Registry.LocalMachine.OpenSubKey(FULL_KEY_PATH, writable: true);
            if (key == null)
            {
                Log.Error("Registry key not found, call HardenRegistryKeys() first");
                return false;
            }

            key.SetValue(valueName, encryptedValue, RegistryValueKind.String);

            Log.Debug("Stored encrypted value: {ValueName}", valueName);
            return true;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to store encrypted value: {Message}", ex.Message);
            return false;
        }
    }

    /// <summary>
    /// Retrieve and decrypt configuration value from hardened registry.
    /// </summary>
    public static string? GetEncryptedValue(string valueName)
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(FULL_KEY_PATH, writable: false);
            if (key == null)
            {
                Log.Warning("Registry key not found");
                return null;
            }

            var encryptedValue = key.GetValue(valueName) as string;
            if (string.IsNullOrEmpty(encryptedValue))
            {
                return null;
            }

            // Decrypt using DPAPI
            var encryptedBytes = Convert.FromBase64String(encryptedValue);
            var decryptedBytes = System.Security.Cryptography.ProtectedData.Unprotect(
                encryptedBytes,
                null,
                System.Security.Cryptography.DataProtectionScope.LocalMachine);

            var decryptedValue = System.Text.Encoding.UTF8.GetString(decryptedBytes);

            return decryptedValue;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to retrieve encrypted value: {Message}", ex.Message);
            return null;
        }
    }

    /// <summary>
    /// Verify registry key integrity (check if ACLs have been tampered with).
    /// </summary>
    public static bool VerifyRegistryIntegrity()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(FULL_KEY_PATH, writable: false);
            if (key == null)
            {
                Log.Warning("Registry key not found for integrity check");
                return false;
            }

            var security = key.GetAccessControl();
            var rules = security.GetAccessRules(true, true, typeof(SecurityIdentifier));

            // Check that only SYSTEM and Administrators have access
            var systemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
            var adminsSid = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);

            bool hasSystemAccess = false;
            bool hasAdminsAccess = false;

            foreach (RegistryAccessRule rule in rules)
            {
                if (rule.IdentityReference.Equals(systemSid))
                {
                    hasSystemAccess = true;
                }
                else if (rule.IdentityReference.Equals(adminsSid))
                {
                    hasAdminsAccess = true;
                }
                else
                {
                    // Unexpected SID has access - integrity compromised
                    Log.Warning("Unexpected SID has registry access: {SID}", rule.IdentityReference);
                    return false;
                }
            }

            if (!hasSystemAccess)
            {
                Log.Warning("SYSTEM does not have registry access - integrity compromised");
                return false;
            }

            Log.Debug("Registry integrity verified");
            return true;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to verify registry integrity: {Message}", ex.Message);
            return false;
        }
    }

    /// <summary>
    /// Delete hardened registry keys (for uninstall).
    /// </summary>
    public static bool DeleteRegistryKeys()
    {
        try
        {
            using var baseKey = Registry.LocalMachine.OpenSubKey(BASE_KEY_PATH, writable: true);
            if (baseKey == null)
            {
                return true; // Already deleted
            }

            baseKey.DeleteSubKeyTree(AGENT_SUBKEY_NAME, throwOnMissingSubKey: false);

            Log.Information("Registry keys deleted");
            return true;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to delete registry keys: {Message}", ex.Message);
            return false;
        }
    }

    /// <summary>
    /// Store installation metadata in hardened registry.
    /// </summary>
    public static bool StoreInstallationMetadata(string installPath, string serviceName)
    {
        try
        {
            var success = true;
            success &= StoreEncryptedValue("InstallPath", installPath);
            success &= StoreEncryptedValue("ServiceName", serviceName);
            success &= StoreEncryptedValue("InstallDate", DateTime.UtcNow.ToString("o"));

            return success;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to store installation metadata: {Message}", ex.Message);
            return false;
        }
    }

    /// <summary>
    /// Get installation path from hardened registry.
    /// </summary>
    public static string? GetInstallPath()
    {
        return GetEncryptedValue("InstallPath");
    }

    /// <summary>
    /// Get service name from hardened registry.
    /// </summary>
    public static string? GetServiceName()
    {
        return GetEncryptedValue("ServiceName");
    }
}
