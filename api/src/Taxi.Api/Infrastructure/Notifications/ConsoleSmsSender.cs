namespace Taxi.Api.Infrastructure.Notifications;

/// <summary>Default dev/test SMS sender: logs the rendered message via the structured logger instead
/// of calling a real provider. AC#1 asserts this output. Never logs a raw verification token; the SMS
/// body here is an operational notification (order code + tracking link), not a secret.</summary>
internal sealed class ConsoleSmsSender(ILogger<ConsoleSmsSender> logger) : ISmsSender
{
    /// <inheritdoc />
    public Task<SmsSendResult> SendAsync(SmsMessage message, CancellationToken ct)
    {
        // The phone number is PII but is the delivery target; log only the last 4 digits for traceability.
        var maskedPhone = Mask(message.ToPhone);
        logger.LogInformation("SMS sent {Provider} {ToPhoneMasked} {Body}",
            "Console", maskedPhone, message.Body);

        var providerMessageId = $"console-{Guid.CreateVersion7():N}";
        return Task.FromResult(new SmsSendResult(true, providerMessageId));
    }

    private static string Mask(string phone)
        => phone.Length <= 4 ? "****" : $"****{phone[^4..]}";
}
