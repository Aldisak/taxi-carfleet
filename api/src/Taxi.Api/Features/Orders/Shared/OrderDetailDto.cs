namespace Taxi.Api.Features.Orders.Shared;

/// <summary>Full order detail returned by GET /orders/{id} and POST /orders (201 response).
/// <para>Version (F-01): the optimistic concurrency token, incremented on every write.
/// The dispatcher reads this value and sends it back on PATCH /orders/{id} so the server can
/// detect stale edits. Also included in the OrderChanged SignalR payload.</para></summary>
/// <param name="Id">Order primary key.</param>
/// <param name="PublicCode">Human-readable 6-char code unique within the fleet.</param>
/// <param name="Status">Current lifecycle status (string name).</param>
/// <param name="Source">How the order was placed (Phone, App, Dispatcher).</param>
/// <param name="CustomerPhone">Customer phone number in E.164 format.</param>
/// <param name="CustomerName">Customer display name. Null for app orders without a name.</param>
/// <param name="PickupAddress">Human-readable pickup address.</param>
/// <param name="PickupLat">Pickup latitude.</param>
/// <param name="PickupLng">Pickup longitude.</param>
/// <param name="DropoffAddress">Human-readable dropoff address. Null if not provided.</param>
/// <param name="DropoffLat">Dropoff latitude. Null if not provided.</param>
/// <param name="DropoffLng">Dropoff longitude. Null if not provided.</param>
/// <param name="ScheduledAt">Scheduled departure time. Null means ASAP.</param>
/// <param name="Note">Dispatcher note. Null if not provided.</param>
/// <param name="Passengers">Number of passengers.</param>
/// <param name="PriceType">Pricing method (Estimate, Fixed, Meter).</param>
/// <param name="EstimatedPriceCzk">Estimated price in CZK. Null if not set.</param>
/// <param name="FixedPriceCzk">Fixed price in CZK. Null if not set.</param>
/// <param name="FinalPriceCzk">Final actual price in CZK. Null until completion.</param>
/// <param name="PaymentType">Payment method. Null until completion.</param>
/// <param name="DriverId">Assigned driver ID. Null when unassigned.</param>
/// <param name="VehicleId">Assigned vehicle ID. Null when unassigned.</param>
/// <param name="CreatedAt">UTC timestamp when the order was created.</param>
/// <param name="UpdatedAt">UTC timestamp when the order was last updated.</param>
/// <param name="AllowedActions">List of lowercase action names the caller may perform on this order.</param>
/// <param name="Version">Optimistic concurrency token. Send back on PATCH to detect stale edits.</param>
/// <param name="RatingStars">Customer star rating (1..5). Null until the order is rated.</param>
/// <param name="RatingComment">Optional customer rating comment. Null unless provided.</param>
/// <param name="RatedAt">UTC timestamp when the customer rated the order. Null until rated.</param>
/// <param name="PriceOverrideReason">Reason supplied when the final price differs from the fixed price. Null unless overridden.</param>
/// <param name="Notifications">Delivery log for this order (sent/failed/skipped), for the dispatcher Notifikace section. Null/empty when not populated.</param>
public record OrderDetailDto(
    Guid Id,
    string PublicCode,
    string Status,
    string Source,
    string CustomerPhone,
    string? CustomerName,
    string PickupAddress,
    double PickupLat,
    double PickupLng,
    string? DropoffAddress,
    double? DropoffLat,
    double? DropoffLng,
    DateTimeOffset? ScheduledAt,
    string? Note,
    int Passengers,
    string PriceType,
    int? EstimatedPriceCzk,
    int? FixedPriceCzk,
    int? FinalPriceCzk,
    string? PaymentType,
    Guid? DriverId,
    Guid? VehicleId,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<string> AllowedActions,
    int Version,
    int? RatingStars = null,
    string? RatingComment = null,
    DateTimeOffset? RatedAt = null,
    string? PriceOverrideReason = null,
    IReadOnlyList<OrderNotificationDto>? Notifications = null);
