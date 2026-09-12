namespace Taxi.Api.Features.Orders.UpdateOrder;

/// <summary>Request body for PATCH /orders/{id} — partial edit of an order.</summary>
public sealed class UpdateOrderRequest
{
    /// <summary>Order primary key (from route).</summary>
    public Guid Id { get; set; }

    /// <summary>Client-loaded version for optimistic concurrency. Must match the current order version.</summary>
    public int? Version { get; set; }

    /// <summary>Updated pickup address. Null means no change.</summary>
    public string? PickupAddress { get; set; }

    /// <summary>Updated pickup latitude. Required when PickupAddress is provided.</summary>
    public double? PickupLat { get; set; }

    /// <summary>Updated pickup longitude. Required when PickupAddress is provided.</summary>
    public double? PickupLng { get; set; }

    /// <summary>Updated dropoff address. Null means no change.</summary>
    public string? DropoffAddress { get; set; }

    /// <summary>Updated dropoff latitude. Required when DropoffAddress is provided.</summary>
    public double? DropoffLat { get; set; }

    /// <summary>Updated dropoff longitude. Required when DropoffAddress is provided.</summary>
    public double? DropoffLng { get; set; }

    /// <summary>Updated scheduled departure time. Null means no change.</summary>
    public DateTimeOffset? ScheduledAt { get; set; }

    /// <summary>Updated dispatcher note. Null means no change.</summary>
    public string? Note { get; set; }

    /// <summary>Updated number of passengers. Null means no change.</summary>
    public int? Passengers { get; set; }
}
