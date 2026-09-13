using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Notifications;

/// <summary>Push sender used in tests and when no VAPID keys are configured. Reports success without
/// contacting a push service.</summary>
internal sealed class NoOpPushSender : IPushSender
{
    /// <inheritdoc />
    public Task<PushSendResult> SendAsync(PushSubscription subscription, PushMessage message, CancellationToken ct)
        => Task.FromResult(new PushSendResult(PushSendOutcome.Sent, null));
}
