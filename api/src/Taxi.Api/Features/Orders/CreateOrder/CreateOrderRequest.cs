using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Orders.CreateOrder;

/// <summary>Request body for POST /orders. Pickup coordinates are mandatory; dropoff is optional.</summary>
public sealed class CreateOrderRequest
{
    /// <summary>Human-readable pickup address.</summary>
    public string PickupAddress { get; init; } = string.Empty;

    /// <summary>Pickup latitude.</summary>
    public double PickupLat { get; init; }

    /// <summary>Pickup longitude.</summary>
    public double PickupLng { get; init; }

    /// <summary>Human-readable dropoff address. Null if not provided.</summary>
    public string? DropoffAddress { get; init; }

    /// <summary>Dropoff latitude. Null if not provided.</summary>
    public double? DropoffLat { get; init; }

    /// <summary>Dropoff longitude. Null if not provided.</summary>
    public double? DropoffLng { get; init; }

    /// <summary>Customer phone number. Dispatcher must supply; Customer defaults to own profile phone if omitted.</summary>
    public string? CustomerPhone { get; init; }

    /// <summary>Customer display name. Optional.</summary>
    public string? CustomerName { get; init; }

    /// <summary>Scheduled departure time. Null means ASAP. If present, must be in the future.</summary>
    public DateTimeOffset? ScheduledAt { get; init; }

    /// <summary>Optional dispatcher note.</summary>
    public string? Note { get; init; }

    /// <summary>Number of passengers. Defaults to 1.</summary>
    public int Passengers { get; init; } = 1;

    /// <summary>Pricing method for this order.</summary>
    public PriceType PriceType { get; init; }

    /// <summary>Estimated price in CZK. Required for Estimate price type.</summary>
    public int? EstimatedPriceCzk { get; init; }

    /// <summary>Fixed price in CZK. Required for Fixed price type.</summary>
    public int? FixedPriceCzk { get; init; }

    /// <summary>Route rule to use for pricing. Optional.</summary>
    public Guid? RouteId { get; init; }

    /// <summary>How the order was placed. Additive + optional (no <c>required</c> to avoid the STJ
    /// missing-field 500 trap). Ignored for customer callers (always App). For a dispatcher caller it
    /// distinguishes a Phone-source order (customer has no app) from a Dispatcher-created order;
    /// defaults to Dispatcher when omitted.</summary>
    public OrderSource? Source { get; init; }

    /// <summary>Route distance in metres from the preceding price quote (quote-once AC#3).
    /// When provided, persisted to <c>orders.distance_m</c> without a second RouteAsync call.</summary>
    public int? DistanceM { get; init; }

    /// <summary>Travel duration in seconds from the preceding price quote (quote-once AC#3).
    /// When provided, persisted to <c>orders.duration_s</c> without a second RouteAsync call.</summary>
    public int? DurationS { get; init; }
}
