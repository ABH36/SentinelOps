using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Serilog;
using SentinelOpsAgent.Config;

namespace SentinelOpsAgent.Commands;

/// <summary>
/// WebSocket-based real-time command listener.
/// Replaces HTTP polling with persistent WebSocket connection for sub-200ms command delivery.
/// Falls back to HTTP polling if WebSocket connection fails.
/// </summary>
public class WebSocketCommandListener : IDisposable
{
    private readonly AgentConfig _config;
    private readonly ILogger _logger;
    private readonly CommandExecutor _commandExecutor;
    private ClientWebSocket? _webSocket;
    private CancellationTokenSource? _cancellationTokenSource;
    private Task? _receiveTask;
    private bool _isConnected = false;
    private int _reconnectAttempts = 0;
    private readonly int[] _reconnectDelays = { 5, 10, 30, 60 }; // seconds: exponential backoff

    public WebSocketCommandListener(AgentConfig config, ILogger logger, CommandExecutor commandExecutor)
    {
        _config = config;
        _logger = logger;
        _commandExecutor = commandExecutor;
    }

    /// <summary>
    /// Indicates whether WebSocket connection is currently active
    /// </summary>
    public bool IsConnected => _isConnected && _webSocket?.State == WebSocketState.Open;

    /// <summary>
    /// Start WebSocket connection with automatic reconnection on failure
    /// </summary>
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.Information("🚀 Starting WebSocket command listener...");

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                if (_config.IsEnrolled && !string.IsNullOrEmpty(_config.DeviceKey))
                {
                    await ConnectAsync(cancellationToken);

                    if (IsConnected)
                    {
                        _reconnectAttempts = 0; // Reset on successful connection
                        _logger.Information("✅ WebSocket connected. Real-time command delivery active.");

                        // Start receive loop
                        await ReceiveLoopAsync(cancellationToken);
                    }
                }
                else
                {
                    _logger.Debug("Device not enrolled yet, waiting...");
                    await Task.Delay(TimeSpan.FromSeconds(10), cancellationToken);
                    continue;
                }
            }
            catch (WebSocketException wsEx)
            {
                _logger.Warning(wsEx, "WebSocket connection failed");
                _isConnected = false;
            }
            catch (OperationCanceledException)
            {
                // Normal shutdown
                break;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "WebSocket listener error");
                _isConnected = false;
            }

            // Reconnect with exponential backoff
            if (!cancellationToken.IsCancellationRequested)
            {
                var delayIndex = Math.Min(_reconnectAttempts, _reconnectDelays.Length - 1);
                var delay = _reconnectDelays[delayIndex];
                _reconnectAttempts++;

                _logger.Information("⏰ Reconnecting in {Delay} seconds (attempt {Attempt})...", delay, _reconnectAttempts);
                await Task.Delay(TimeSpan.FromSeconds(delay), cancellationToken);
            }
        }

        _logger.Information("WebSocket listener stopped");
    }

    /// <summary>
    /// Establish WebSocket connection to backend gateway
    /// </summary>
    private async Task ConnectAsync(CancellationToken cancellationToken)
    {
        // Dispose previous socket if exists
        _webSocket?.Dispose();
        _webSocket = new ClientWebSocket();

        // Add device credentials to headers for authentication
        _webSocket.Options.SetRequestHeader("X-Device-Key", _config.DeviceKey!);
        _webSocket.Options.SetRequestHeader("X-Device-Secret", _config.DeviceSecret!);

        // Build WebSocket URL from HTTP server URL
        var serverUrl = _config.ServerUrl ?? "http://localhost:3001/api";
        var wsUrl = serverUrl
            .Replace("http://", "ws://")
            .Replace("https://", "wss://")
            .Replace("/api", ""); // Remove /api suffix

        var gatewayUrl = $"{wsUrl}/agent-gateway";

        _logger.Information("Connecting to WebSocket: {Url}", gatewayUrl);

        try
        {
            await _webSocket.ConnectAsync(new Uri(gatewayUrl), cancellationToken);
            _isConnected = true;
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Failed to connect to WebSocket");
            _isConnected = false;
            throw;
        }
    }

    /// <summary>
    /// Receive loop: continuously listen for commands from server
    /// </summary>
    private async Task ReceiveLoopAsync(CancellationToken cancellationToken)
    {
        var buffer = new byte[1024 * 16]; // 16KB buffer
        var messageBuilder = new StringBuilder();

        try
        {
            while (_webSocket?.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
            {
                WebSocketReceiveResult result;
                messageBuilder.Clear();

                // Receive message (may come in multiple chunks)
                do
                {
                    result = await _webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);

                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        _logger.Information("Server requested WebSocket close");
                        await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Server closed", CancellationToken.None);
                        _isConnected = false;
                        return;
                    }

                    messageBuilder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                }
                while (!result.EndOfMessage);

                var message = messageBuilder.ToString();

                if (!string.IsNullOrWhiteSpace(message))
                {
                    await HandleMessageAsync(message, cancellationToken);
                }
            }
        }
        catch (WebSocketException wsEx)
        {
            _logger.Warning(wsEx, "WebSocket receive error");
            _isConnected = false;
        }
        catch (OperationCanceledException)
        {
            // Normal cancellation
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Receive loop error");
            _isConnected = false;
        }
    }

    /// <summary>
    /// Handle received message from server
    /// </summary>
    private async Task HandleMessageAsync(string message, CancellationToken cancellationToken)
    {
        try
        {
            // Parse message as JSON to determine event type
            var json = JObject.Parse(message);

            // Socket.IO sends messages with event name in array format
            // Example: ["command", {"id": "...", "actionType": "LOCK", ...}]
            if (json.Type == JTokenType.Array)
            {
                var array = (JArray)json;
                if (array.Count >= 2)
                {
                    var eventName = array[0]?.ToString();
                    var eventData = array[1];

                    switch (eventName)
                    {
                        case "command":
                            await HandleCommandAsync(eventData, cancellationToken);
                            break;

                        case "connection:ack":
                            _logger.Information("📡 Connection acknowledged: {Data}", eventData?.ToString());
                            break;

                        default:
                            _logger.Debug("Received unknown event: {EventName}", eventName);
                            break;
                    }
                }
            }
            // Direct JSON object (non-Socket.IO format)
            else if (json["actionType"] != null)
            {
                await HandleCommandAsync(json, cancellationToken);
            }
            else
            {
                _logger.Debug("Received message: {Message}", message.Substring(0, Math.Min(100, message.Length)));
            }
        }
        catch (JsonException jsonEx)
        {
            _logger.Warning(jsonEx, "Failed to parse WebSocket message: {Message}", message.Substring(0, Math.Min(100, message.Length)));
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Error handling WebSocket message");
        }
    }

    /// <summary>
    /// Handle command received from server
    /// </summary>
    private async Task HandleCommandAsync(JToken? commandData, CancellationToken cancellationToken)
    {
        if (commandData == null)
        {
            _logger.Warning("Received null command data");
            return;
        }

        try
        {
            var command = commandData.ToObject<CommandItem>();
            
            if (command == null)
            {
                _logger.Warning("Failed to deserialize command");
                return;
            }

            _logger.Information("📥 Received WebSocket command: {ActionType} (ID: {CommandId})", command.actionType, command.id);

            // Execute command using existing CommandExecutor logic
            await _commandExecutor.ExecuteSingleCommandAsync(command, cancellationToken);

            // Note: Command result is sent via HTTP in ExecuteSingleCommandAsync
            // Future enhancement: Send result via WebSocket using SendCommandResultAsync()
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Error executing WebSocket command");
        }
    }

    /// <summary>
    /// Send command execution result back to server via WebSocket
    /// </summary>
    public async Task SendCommandResultAsync(string commandId, string status, Dictionary<string, object> result, string? errorMessage = null)
    {
        if (!IsConnected)
        {
            _logger.Warning("Cannot send command result: WebSocket not connected");
            return;
        }

        try
        {
            var resultMessage = new
            {
                commandId,
                status,
                result,
                errorMessage
            };

            // Socket.IO format: ["event_name", {data}]
            var socketIoMessage = new object[] { "command:result", resultMessage };
            var json = JsonConvert.SerializeObject(socketIoMessage);
            var bytes = Encoding.UTF8.GetBytes(json);

            await _webSocket!.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
            _logger.Debug("Sent command result for {CommandId}", commandId);
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Failed to send command result via WebSocket");
        }
    }

    /// <summary>
    /// Send terminal output line for real-time streaming (EXECUTE_COMMAND)
    /// </summary>
    public async Task SendTerminalOutputAsync(string commandId, string line)
    {
        if (!IsConnected)
        {
            return;
        }

        try
        {
            var outputMessage = new
            {
                commandId,
                line,
                timestamp = DateTime.UtcNow.ToString("o")
            };

            var socketIoMessage = new object[] { "terminal:stdout", outputMessage };
            var json = JsonConvert.SerializeObject(socketIoMessage);
            var bytes = Encoding.UTF8.GetBytes(json);

            await _webSocket!.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.Debug(ex, "Failed to send terminal output via WebSocket");
            // Non-critical, continue
        }
    }

    public void Dispose()
    {
        _cancellationTokenSource?.Cancel();
        _webSocket?.Dispose();
    }
}

/// <summary>
/// Command item structure matching backend RemoteAction
/// </summary>
public class CommandItem
{
    public string id { get; set; } = string.Empty;
    public string actionType { get; set; } = string.Empty;
    public Dictionary<string, object>? parameters { get; set; }
    public Dictionary<string, object>? payload { get; set; } // Legacy field
}
