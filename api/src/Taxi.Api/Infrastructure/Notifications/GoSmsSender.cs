using System.Net.Http.Json;

namespace Taxi.Api.Infrastructure.Notifications;

/// <summary>GoSMS HTTP provider adapter. Selected via <c>Notifications:SmsProvider=GoSms</c>.
/// Untested against the live API (assignment out-of-scope); the contract mirrors the GoSMS REST
/// message endpoint. Never logs the raw message body or credentials.</summary>
internal sealed class GoSmsSender(HttpClient httpClient, ILogger<GoSmsSender> logger) : ISmsSender
{
    /// <inheritdoc />
    public async Task<SmsSendResult> SendAsync(SmsMessage message, CancellationToken ct)
    {
        var payload = new
        {
            recipients = new[] { message.ToPhone },
            message = message.Body,
            sender = message.SenderName
        };

        using var response = await httpClient.PostAsJsonAsync("messages", payload, ct);
        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("SMS send failed {Provider} {StatusCode} {Reason}",
                "GoSms", (int)response.StatusCode, "ProviderRejected");
            return new SmsSendResult(false, null);
        }

        var body = await response.Content.ReadFromJsonAsync<GoSmsResponse>(ct);
        return new SmsSendResult(true, body?.Id);
    }

    private sealed record GoSmsResponse(string? Id);
}
