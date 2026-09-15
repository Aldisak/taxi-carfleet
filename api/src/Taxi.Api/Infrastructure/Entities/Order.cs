using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>A taxi ride order. Lifecycle managed exclusively by <c>OrderStateMachine</c>.</summary>
public class Order : ITenantEntity
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Fleet this order belongs to.</summary>
    public Guid FleetId { get; set; }

    /// <summary>Human-readable 6-character code (e.g. "K7F2A9"). Unique per fleet.</summary>
    public required string PublicCode { get; set; }

    /// <summary>Current lifecycle status. Set only via <c>OrderStateMachine</c>.</summary>
    public OrderStatus Status { get; set; }

    /// <summary>How the order was placed.</summary>
    public OrderSource Source { get; set; }

    /// <summary>Customer user account, if any. Null for phone orders without an app account.</summary>
    public Guid? CustomerUserId { get; set; }

    /// <summary>Customer phone number in E.164 format.</summary>
    public required string CustomerPhone { get; set; }

    /// <summary>Customer's display name. Null for app orders (taken from the user profile).</summary>
    public string? CustomerName { get; set; }

    /// <summary>Human-readable pickup address.</summary>
    public required string PickupAddress { get; set; }

    /// <summary>Pickup latitude.</summary>
    public double PickupLat { get; set; }

    /// <summary>Pickup longitude.</summary>
    public double PickupLng { get; set; }

    /// <summary>Human-readable dropoff address. Null when not provided.</summary>
    public string? DropoffAddress { get; set; }

    /// <summary>Dropoff latitude. Null when not provided.</summary>
    public double? DropoffLat { get; set; }

    /// <summary>Dropoff longitude. Null when not provided.</summary>
    public double? DropoffLng { get; set; }

    /// <summary>Scheduled departure time. Null means ASAP.</summary>
    public DateTimeOffset? ScheduledAt { get; set; }

    /// <summary>Optional dispatcher note on the order.</summary>
    public string? Note { get; set; }

    /// <summary>Number of passengers. Defaults to 1.</summary>
    public int Passengers { get; set; } = 1;

    /// <summary>Pricing method for this order.</summary>
    public PriceType PriceType { get; set; }

    /// <summary>Estimated price in CZK (integer). Set at creation for Estimate/Fixed types.</summary>
    public int? EstimatedPriceCzk { get; set; }

    /// <summary>Fixed price in CZK (integer). Set at creation for Fixed price type.</summary>
    public int? FixedPriceCzk { get; set; }

    /// <summary>Route rule used to price this order. Null if priced manually.</summary>
    public Guid? RouteId { get; set; }

    /// <summary>Final actual price in CZK (integer). Set only at completion.</summary>
    public int? FinalPriceCzk { get; set; }

    /// <summary>Reason provided when the final price differs from the fixed price.</summary>
    public string? PriceOverrideReason { get; set; }

    /// <summary>Payment method used to settle the order. Null until completion.</summary>
    public PaymentType? PaymentType { get; set; }

    /// <summary>Driver assigned to this order. Null when unassigned.</summary>
    public Guid? DriverId { get; set; }

    /// <summary>Vehicle used for this order. Null when unassigned.</summary>
    public Guid? VehicleId { get; set; }

    /// <summary>UTC timestamp when a driver was first assigned. Null until assigned.</summary>
    public DateTimeOffset? AssignedAt { get; set; }

    /// <summary>UTC timestamp when the driver accepted the order. Null until accepted.</summary>
    public DateTimeOffset? AcceptedAt { get; set; }

    /// <summary>UTC timestamp when the driver arrived at the pickup. Null until arrived.</summary>
    public DateTimeOffset? ArrivedAt { get; set; }

    /// <summary>UTC timestamp when the ride started. Null until started.</summary>
    public DateTimeOffset? StartedAt { get; set; }

    /// <summary>UTC timestamp when the ride was completed. Null until completed.</summary>
    public DateTimeOffset? CompletedAt { get; set; }

    /// <summary>UTC timestamp when the order was cancelled. Null unless cancelled.</summary>
    public DateTimeOffset? CancelledAt { get; set; }

    /// <summary>Reason the order was cancelled. Null unless cancelled.</summary>
    public string? CancelReason { get; set; }

    /// <summary>Role of the actor who cancelled the order. Null unless cancelled.</summary>
    public UserRole? CancelledByRole { get; set; }

    /// <summary>User who created the order. Null for app-created orders without a user account.</summary>
    public Guid? CreatedByUserId { get; set; }

    /// <summary>UTC timestamp when the order was created.</summary>
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>UTC timestamp when the order was last updated.</summary>
    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>Optimistic concurrency token. Incremented on every write by the caller.</summary>
    public int Version { get; set; }

    /// <summary>Route distance in metres returned by the geo provider. Null until the route is calculated.</summary>
    public int? DistanceM { get; set; }

    /// <summary>Estimated travel duration in seconds returned by the geo provider. Null until the route is calculated.</summary>
    public int? DurationS { get; set; }

    /// <summary>Customer star rating (1..5). Null until the customer rates a completed order.</summary>
    public int? RatingStars { get; set; }

    /// <summary>Optional free-text rating comment (max 500). Null unless provided.</summary>
    public string? RatingComment { get; set; }

    /// <summary>UTC timestamp when the customer rated the order. Null until rated.</summary>
    public DateTimeOffset? RatedAt { get; set; }
}
