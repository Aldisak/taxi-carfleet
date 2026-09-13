using System.Globalization;

namespace Taxi.Api.Infrastructure.Notifications;

/// <summary>SMSbrána HTTP provider adapter. Selected via <c>Notifications:SmsProvider=Smsbrana</c>.
/// Untested against the live API (assignment out-of-scope); uses the SMSbrána HTTP GET API.
/// Never logs the raw message body or credentials.</summary>
internal sealed class SmsbranaSmsSender(HttpClient httpClient, ILogger<SmsbranaSmsSender> logger) : ISmsSender
{
    /// <inheritdoc />
    public async Task<SmsSendResult> SendAsync(SmsMessage message, CancellationToken ct)
    {
        // SMSbrána "action=send_sms" HTTP API. Credentials are provided via the pre-configured
        // HttpClient base address / default query (wired in DI; prod secrets → assignment 08).
        var query = $"?action=send_sms&number={Uri.EscapeDataString(message.ToPhone)}" +
                    $"&message={Uri.EscapeDataString(message.Body)}";

        using var response = await httpClient.GetAsync(query, ct);
        var text = await response.Content.ReadAsStringAsync(ct);

        // SMSbrána returns an XML/plain body; "<err>0</err>" indicates success.
        var ok = response.IsSuccessStatusCode && text.Contains("<err>0</err>", StringComparison.OrdinalIgnoreCase);
        if (!ok)
        {
            logger.LogWarning("SMS send failed {Provider} {StatusCode} {Reason}",
                "Smsbrana", (int)response.StatusCode, "ProviderRejected");
            return new SmsSendResult(false, null);
        }

        return new SmsSendResult(true, response.Headers.Date?.ToUnixTimeSeconds()
            .ToString(CultureInfo.InvariantCulture));
    }
}
