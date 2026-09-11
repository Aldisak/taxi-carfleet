namespace Taxi.Api.Infrastructure.Entities;

/// <summary>A Web Push subscription for a user device. FleetId is nullable because Customer push
/// subscriptions are not scoped to a fleet.</summary>
public class PushSubscription
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Fleet this subscription belongs to. Null for Customer subscriptions.</summary>
    public Guid? FleetId { get; set; }

    /// <summary>User who owns this push subscription.</summary>
    public Guid UserId { get; set; }

    /// <summary>Push endpoint URL provided by the browser.</summary>
    public required string Endpoint { get; set; }

    /// <summary>P-256 ECDH public key (base64url-encoded) for payload encryption.</summary>
    public required string P256dh { get; set; }

    /// <summary>Auth secret (base64url-encoded) for payload encryption.</summary>
    public required string Auth { get; set; }

    /// <summary>User agent string of the subscribing browser.</summary>
    public string? UserAgent { get; set; }

    /// <summary>UTC timestamp when the subscription was created.</summary>
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>UTC timestamp of the most recent push send to this subscription.</summary>
    public DateTimeOffset? LastUsedAt { get; set; }
}
