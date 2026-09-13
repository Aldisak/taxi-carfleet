using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Notifications;

/// <summary>Builds the canonical dedup key for a notification delivery — the same tuple that the
/// <c>notification_log</c> unique index enforces at send time. Deterministic and stable.</summary>
public static class NotificationDedupKey
{
    /// <summary>Returns the canonical dedup key string for a delivery.</summary>
    /// <param name="evt">The event.</param>
    /// <param name="orderId">The order id (or null).</param>
    /// <param name="recipient">The stable recipient key (user id / phone / endpoint).</param>
    /// <param name="channel">The channel.</param>
    public static string For(NotificationEvent evt, Guid? orderId, string recipient, NotificationChannel channel)
        => $"{evt}|{orderId?.ToString() ?? "-"}|{recipient}|{channel}";
}
