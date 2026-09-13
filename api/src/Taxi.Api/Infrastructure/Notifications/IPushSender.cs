using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Notifications;

/// <summary>Sends a Web Push message to a single subscription. On HTTP 410 Gone the implementation
/// deletes the subscription (AC#4) and reports <see cref="PushSendOutcome.Gone"/>.</summary>
internal interface IPushSender
{
    /// <summary>Sends the message to the given subscription.</summary>
    /// <param name="subscription">The target subscription.</param>
    /// <param name="message">The rendered push payload.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<PushSendResult> SendAsync(PushSubscription subscription, PushMessage message, CancellationToken ct);
}
