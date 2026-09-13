namespace Taxi.Api.Features.Orders.Shared;

/// <summary>A single notification delivery shown in the order-detail "Notifikace" section. A Failed
/// Sms item drives the dispatcher red-icon signal (AC#3 server half).</summary>
/// <param name="Event">The notification event (enum string name).</param>
/// <param name="Channel">The channel (Sms or Push).</param>
/// <param name="Recipient">The recipient key (phone / user id).</param>
/// <param name="Status">The delivery status (Queued/Sent/Failed/SkippedCap/SkippedNoChannel/Skipped).</param>
/// <param name="Error">Stable error discriminator when failed/skipped. Null otherwise.</param>
/// <param name="CreatedAt">UTC timestamp when the notification row was created.</param>
/// <param name="SentAt">UTC timestamp when the send succeeded. Null until Sent.</param>
public record OrderNotificationDto(
    string Event,
    string Channel,
    string Recipient,
    string Status,
    string? Error,
    DateTimeOffset CreatedAt,
    DateTimeOffset? SentAt);
