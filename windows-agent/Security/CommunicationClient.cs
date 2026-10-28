using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Serilog;
using SentinelOpsAgent.Config;

namespace SentinelOpsAgent.Security;

public class ApiResponse<T>
{
    public bool IsSuccess { get; set; }
    public T? Data { get; set; }
    public string? ErrorMessage { get; set; }
}

public class CommunicationClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger _logger;
    private readonly AgentConfig _config;

    public CommunicationClient(
        HttpClient httpClient,
        ILogger logger,
        IOptions<AgentConfig> config)
    {
        _httpClient = httpClient;
        _logger = logger;
        _config = config.Value;

        _httpClient.BaseAddress = new Uri(_config.ApiUrl);
        _httpClient.Timeout = TimeSpan.FromSeconds(30);
    }

    public async Task<ApiResponse<T>> GetAsync<T>(string endpoint, CancellationToken cancellationToken = default)
    {
        try
        {
            AddAuthHeaders();

            var response = await _httpClient.GetAsync(endpoint, cancellationToken);
            var content = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.IsSuccessStatusCode)
            {
                var data = JsonSerializer.Deserialize<T>(content);
                return new ApiResponse<T> { IsSuccess = true, Data = data };
            }
            else
            {
                _logger.Warning("GET {Endpoint} failed: {StatusCode}", endpoint, response.StatusCode);
                return new ApiResponse<T> { IsSuccess = false, ErrorMessage = content };
            }
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "GET {Endpoint} error", endpoint);
            return new ApiResponse<T> { IsSuccess = false, ErrorMessage = ex.Message };
        }
    }

    public async Task<ApiResponse<T>> PostAsync<T>(string endpoint, object data, CancellationToken cancellationToken = default)
    {
        try
        {
            AddAuthHeaders();

            var response = await _httpClient.PostAsJsonAsync(endpoint, data, cancellationToken);
            var content = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.IsSuccessStatusCode)
            {
                var result = JsonSerializer.Deserialize<T>(content);
                return new ApiResponse<T> { IsSuccess = true, Data = result };
            }
            else
            {
                _logger.Warning("POST {Endpoint} failed: {StatusCode}", endpoint, response.StatusCode);
                return new ApiResponse<T> { IsSuccess = false, ErrorMessage = content };
            }
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "POST {Endpoint} error", endpoint);
            return new ApiResponse<T> { IsSuccess = false, ErrorMessage = ex.Message };
        }
    }

    public async Task<ApiResponse<JsonElement>> PostAsync(string endpoint, object data, CancellationToken cancellationToken = default)
    {
        return await PostAsync<JsonElement>(endpoint, data, cancellationToken);
    }

    public async Task<ApiResponse<JsonElement>> GetAsync(string endpoint, CancellationToken cancellationToken = default)
    {
        return await GetAsync<JsonElement>(endpoint, cancellationToken);
    }

    public async Task<ApiResponse<T>> PostMultipartAsync<T>(string endpoint, MultipartFormDataContent content, CancellationToken cancellationToken = default)
    {
        try
        {
            AddAuthHeaders();

            var response = await _httpClient.PostAsync(endpoint, content, cancellationToken);
            var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.IsSuccessStatusCode)
            {
                var result = JsonSerializer.Deserialize<T>(responseContent);
                return new ApiResponse<T> { IsSuccess = true, Data = result };
            }
            else
            {
                _logger.Warning("POST Multipart {Endpoint} failed: {StatusCode}", endpoint, response.StatusCode);
                return new ApiResponse<T> { IsSuccess = false, ErrorMessage = responseContent };
            }
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "POST Multipart {Endpoint} error", endpoint);
            return new ApiResponse<T> { IsSuccess = false, ErrorMessage = ex.Message };
        }
    }

    private void AddAuthHeaders()
    {
        _httpClient.DefaultRequestHeaders.Clear();
        _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        // Only add device credentials if enrolled
        if (_config.IsEnrolled && !string.IsNullOrEmpty(_config.DeviceKey) && !string.IsNullOrEmpty(_config.DeviceSecret))
        {
            _httpClient.DefaultRequestHeaders.Add("X-Device-Key", _config.DeviceKey);
            _httpClient.DefaultRequestHeaders.Add("X-Device-Secret", _config.DeviceSecret);
        }
    }
}
