using System.Text.Json;
using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Transactional-outbox row. Written in the SAME transaction as the order change that
/// triggered it (the dispatch job sends it asynchronously). Carries INTENT only — the SMS body /
/// push payload are rendered at SEND time from the order's then-final state.</summary>
public class NotificationOutbox : ITenantEntity
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Fleet this notification belongs to.</summary>
    public Guid FleetId { get; set; }

    /// <summary>The business event that triggered the notification.</summary>
    public NotificationEvent Event { get; set; }

    /// <summary>The order this notification relates to. Null for order-independent notifications.</summary>
    public Guid? OrderId { get; set; }

    /// <summary>The delivery channel (SMS or Push).</summary>
    public NotificationChannel Channel { get; set; }

    /// <summary>Recipient user id, when the recipient is a known user (driver/dispatcher/app customer).</summary>
    public Guid? RecipientUserId { get; set; }

    /// <summary>Recipient phone number (E.164) for SMS to a phone-only customer. Null for push.</summary>
    public string? RecipientPhone { get; set; }

    /// <summary>Recipient push endpoint for push channel. Null for SMS.</summary>
    public string? RecipientEndpoint { get; set; }

    /// <summary>Optional typed payload carried to send time (jsonb). Never a pre-rendered SMS body.</summary>
    public JsonDocument? PayloadJson { get; set; }

    /// <summary>Number of send attempts so far.</summary>
    public int Attempts { get; set; }

    /// <summary>Earliest UTC time the dispatch job may attempt the next send (backoff).</summary>
    public DateTimeOffset NextAttemptAt { get; set; }

    /// <summary>Current status of this outbox row.</summary>
    public NotificationStatus Status { get; set; }

    /// <summary>UTC timestamp when this row was enqueued.</summary>
    public DateTimeOffset CreatedAt { get; set; }
}
