using System.Text.Json;
using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>An immutable audit record of a single transition or annotation on an <see cref="Order"/>.</summary>
public class OrderEvent : ITenantEntity
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Fleet this event belongs to.</summary>
    public Guid FleetId { get; set; }

    /// <summary>Order this event is associated with.</summary>
    public Guid OrderId { get; set; }

    /// <summary>Type of event that occurred.</summary>
    public OrderEventType Type { get; set; }

    /// <summary>Order status before this event. Null for Created events.</summary>
    public OrderStatus? FromStatus { get; set; }

    /// <summary>Order status after this event.</summary>
    public OrderStatus ToStatus { get; set; }

    /// <summary>User who triggered the event. Null for system-initiated events (e.g. Timeout).</summary>
    public Guid? ActorUserId { get; set; }

    /// <summary>Role of the actor who triggered the event.</summary>
    public UserRole ActorRole { get; set; }

    /// <summary>Additional structured data for this event (stored as jsonb). May be null for simple transitions.</summary>
    public JsonDocument? Payload { get; set; }

    /// <summary>UTC timestamp when the event occurred.</summary>
    public DateTimeOffset At { get; set; }
}
