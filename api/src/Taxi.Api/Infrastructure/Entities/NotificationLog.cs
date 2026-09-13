using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Immutable-ish delivery-log row. The unique index on
/// <c>(FleetId, Event, OrderId, Recipient, Channel)</c> also serves as the send-time dedup claim
/// (claim-then-execute): the dispatch job inserts this row BEFORE calling the sender, so a second
/// outbox row for the same key is blocked by a 23505 unique violation.</summary>
public class NotificationLog : ITenantEntity
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Fleet this notification belongs to.</summary>
    public Guid FleetId { get; set; }

    /// <summary>The business event.</summary>
    public NotificationEvent Event { get; set; }

    /// <summary>The order this notification relates to. Null for order-independent notifications.</summary>
    public Guid? OrderId { get; set; }

    /// <summary>The delivery channel.</summary>
    public NotificationChannel Channel { get; set; }

    /// <summary>Stable recipient key: a user id string, phone number, or push endpoint.
    /// Used as a dedup discriminator (part of the unique index).</summary>
    public required string Recipient { get; set; }

    /// <summary>Delivery status.</summary>
    public NotificationStatus Status { get; set; }

    /// <summary>Provider message id returned on a successful send. Null otherwise.</summary>
    public string? ProviderMessageId { get; set; }

    /// <summary>Error discriminator when the send failed (a stable reason, never raw provider text
    /// that could contain PII). Null on success.</summary>
    public string? Error { get; set; }

    /// <summary>UTC timestamp when this row (the claim) was created.</summary>
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>UTC timestamp when the send succeeded. Null until Sent.</summary>
    public DateTimeOffset? SentAt { get; set; }
}
