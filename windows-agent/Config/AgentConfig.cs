namespace SentinelOpsAgent.Config;

public class AgentConfig
{
    public const string SectionName = "Agent";

    public string ApiUrl { get; set; } = "http://localhost:3001/api";
    public string DeviceId { get; set; } = string.Empty;
    public string DeviceKey { get; set; } = string.Empty;
    public string DeviceSecret { get; set; } = string.Empty;
    public int HeartbeatIntervalSeconds { get; set; } = 300; // 5 minutes
    public int InventoryIntervalSeconds { get; set; } = 3600; // 1 hour
    public bool IsEnrolled { get; set; } = false;
}
