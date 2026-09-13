namespace Taxi.Api.Infrastructure.Notifications;

/// <summary>Sends an SMS via a provider. One implementation is selected by the
/// <c>Notifications:SmsProvider</c> config (default Console in dev/test).</summary>
internal interface ISmsSender
{
    /// <summary>Sends the message. Returns a result; throws only on unexpected infrastructure errors
    /// (which the dispatch job treats as a retryable failure).</summary>
    /// <param name="message">The rendered SMS.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<SmsSendResult> SendAsync(SmsMessage message, CancellationToken ct);
}
