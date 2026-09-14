namespace Taxi.Api.Features.Admin.GetPlatformAnalytics;

/// <summary>Response DTO for GET /api/v1/admin/analytics.</summary>
/// <param name="Fleets">Per-fleet health rows, one per active fleet.</param>
/// <param name="Totals">Platform-wide aggregated totals.</param>
public sealed record GetPlatformAnalyticsResponse(
    List<FleetHealthRowDto> Fleets,
    PlatformTotalsDto Totals);

/// <summary>Per-fleet analytics row in the platform admin view.</summary>
/// <param name="FleetId">Fleet identifier.</param>
/// <param name="FleetName">Fleet display name.</param>
/// <param name="RidesThisMonth">Completed rides in the current Prague calendar month.</param>
/// <param name="RidesLastMonth">Completed rides in the previous Prague calendar month.</param>
/// <param name="RevenueThisMonthCzk">Revenue (CZK) from completed orders this Prague month.</param>
/// <param name="RevenueLastMonthCzk">Revenue (CZK) from completed orders last Prague month.</param>
/// <param name="MomDeltaPct">Month-over-month rides delta as a percentage (rounded to 1 decimal).</param>
/// <param name="ActiveDrivers">Drivers with ≥1 completed ride this month.</param>
/// <param name="ActiveCustomers">Distinct customer user IDs with ≥1 completed ride this month.</param>
/// <param name="SmsCount">SMS messages sent this month.</param>
/// <param name="SmsEstimatedCostCzk">Estimated SMS cost in CZK (1 CZK/SMS).</param>
/// <param name="LastOrderAt">UTC timestamp of the most recent order (any status), or null if no orders.</param>
/// <param name="SparklineWeeks">Completed ride counts for each of the 12 most recent ISO weeks (oldest first).</param>
/// <param name="Health">Rule-based health flag: growing, stable, declining, or inactive.</param>
public sealed record FleetHealthRowDto(
    Guid FleetId,
    string FleetName,
    int RidesThisMonth,
    int RidesLastMonth,
    int RevenueThisMonthCzk,
    int RevenueLastMonthCzk,
    double MomDeltaPct,
    int ActiveDrivers,
    int ActiveCustomers,
    int SmsCount,
    int SmsEstimatedCostCzk,
    DateTimeOffset? LastOrderAt,
    List<int> SparklineWeeks,
    string Health);

/// <summary>Platform-wide totals row.</summary>
/// <param name="TotalFleets">Number of fleets included in the response.</param>
/// <param name="TotalRidesThisMonth">Sum of completed rides this month across all fleets.</param>
/// <param name="TotalRevenueThisMonthCzk">Sum of revenue this month across all fleets.</param>
/// <param name="GrowingFleets">Number of fleets with health = "growing".</param>
/// <param name="DecliningFleets">Number of fleets with health = "declining".</param>
/// <param name="InactiveFleets">Number of fleets with health = "inactive".</param>
public sealed record PlatformTotalsDto(
    int TotalFleets,
    int TotalRidesThisMonth,
    int TotalRevenueThisMonthCzk,
    int GrowingFleets,
    int DecliningFleets,
    int InactiveFleets);
