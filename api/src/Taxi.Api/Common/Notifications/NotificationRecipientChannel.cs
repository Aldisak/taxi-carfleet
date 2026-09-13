using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Notifications;

/// <summary>A resolved routing decision: which recipient role receives the notification on which
/// channel. The engine (A4) maps the role to a concrete recipient (user id / phone / endpoint).</summary>
/// <param name="Recipient">The recipient role for this delivery.</param>
/// <param name="Channel">The channel (SMS or Push).</param>
public readonly record struct NotificationRecipientChannel(
    NotificationRecipientRole Recipient,
    NotificationChannel Channel);
