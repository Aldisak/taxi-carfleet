namespace Taxi.Api.Features.Analytics.GetDriverDrilldown;

/// <summary>Response for GET /api/v1/analytics/drivers/{id} — driver drill-down with weekly trend and coaching view.</summary>
/// <param name="DriverId">Driver entity ID.</param>
/// <param name="Name">Driver display name.</param>
/// <param name="WeeklyTrend">Rides, revenue, and avg rating per ISO week for the window.</param>
/// <param name="LowRatedOrders">Recent completed orders with rating ≤ 3, ordered by completed_at descending.</param>
public record GetDriverDrilldownResponse(
    Guid DriverId,
    string Name,
    List<DriverWeeklyTrendDto> WeeklyTrend,
    List<LowRatedOrderDto> LowRatedOrders);

/// <summary>Driver metrics for one ISO week.</summary>
/// <param name="WeekStart">ISO week Monday in yyyy-MM-dd format.</param>
/// <param name="RidesCompleted">Number of completed rides in the week.</param>
/// <param name="RevenueCzk">Total final_price_czk for completed rides.</param>
/// <param name="AvgRating">Average customer rating for rated rides in the week. Null when no rated rides.</param>
public record DriverWeeklyTrendDto(
    string WeekStart,
    int RidesCompleted,
    int RevenueCzk,
    double? AvgRating);

/// <summary>A completed order with a low customer rating (≤ 3 stars), for coaching purposes.</summary>
/// <param name="OrderId">Order entity ID.</param>
/// <param name="CompletedAt">UTC timestamp when the ride was completed.</param>
/// <param name="RatingStars">Customer rating (1–3).</param>
/// <param name="RatingComment">Optional customer comment. Null if none provided.</param>
/// <param name="PublicCode">Human-readable 6-character order code.</param>
/// <param name="PickupAddress">Pickup address string.</param>
/// <param name="DropoffAddress">Dropoff address string. Null if not set.</param>
public record LowRatedOrderDto(
    Guid OrderId,
    DateTimeOffset CompletedAt,
    int RatingStars,
    string? RatingComment,
    string PublicCode,
    string PickupAddress,
    string? DropoffAddress);
