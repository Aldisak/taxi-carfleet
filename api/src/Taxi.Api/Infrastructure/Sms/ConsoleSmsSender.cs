using Microsoft.Extensions.Logging;

namespace Taxi.Api.Infrastructure.Sms;

/// <summary>Development SMS sender that logs a masked marker to the console. The raw code is NEVER
/// logged — only the last 4 digits of the recipient phone and a fixed "SMS sent" marker are recorded,
/// satisfying the logging#what-must-not-appear-in-logs rule for OTP/code secrets.</summary>
internal sealed class ConsoleSmsSender(ILogger<ConsoleSmsSender> logger) : ISmsSender
{
    /// <inheritdoc />
    public Task SendAsync(string phone, string message, CancellationToken ct)
    {
        // Mask phone to last-4 digits only — never log the message (it contains the OTP code).
        var masked = phone.Length >= 4
            ? $"****{phone[^4..]}"
            : "****";

        logger.LogInformation("Sms sent {Phone}", masked);
        return Task.CompletedTask;
    }
}
