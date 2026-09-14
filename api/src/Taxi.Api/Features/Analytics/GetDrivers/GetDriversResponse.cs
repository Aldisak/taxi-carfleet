namespace Taxi.Api.Features.Analytics.GetDrivers;

/// <summary>Response for GET /api/v1/analytics/drivers — driver league table and retention series.</summary>
/// <param name="Drivers">Driver league table rows, sorted by rides completed descending.</param>
/// <param name="Retention">Driver retention per ISO week: active, newly activated, churned counts.</param>
/// <param name="Prior">All sections recomputed for the prior equal-length period (null when compare=false).</param>
public record GetDriversResponse(
    List<DriverLeagueRowDto> Drivers,
    List<RetentionBucketDto> Retention,
    GetDriversPriorDto? Prior = null);

/// <summary>All drivers sections recomputed for the prior equal-length period (only when compare=true).</summary>
/// <param name="Drivers">Driver league table for the prior period.</param>
/// <param name="Retention">Retention series for the prior period.</param>
public record GetDriversPriorDto(
    List<DriverLeagueRowDto> Drivers,
    List<RetentionBucketDto> Retention);

/// <summary>One driver's aggregate metrics across the analytics window.</summary>
/// <param name="DriverId">Driver entity ID.</param>
/// <param name="Name">Driver display name from the linked user record.</param>
/// <param name="RidesCompleted">Number of completed rides in the window.</param>
/// <param name="RevenueCzk">Total final_price_czk of completed rides.</param>
/// <param name="OnlineHours">Total online hours from driver_shifts (clamped to window boundaries).</param>
/// <param name="UtilizationPct">Busy seconds (accepted_at → completed_at) / online seconds × 100.</param>
/// <param name="RevenuePerOnlineHour">RevenueCzk / OnlineHours (0 when OnlineHours = 0).</param>
/// <param name="AcceptanceRate">Accepted offers / (Accepted + Declined+Timeout offers) × 100.</param>
/// <param name="AvgTimeToAcceptSeconds">Average seconds from assigned_at to accepted_at for completed rides.</param>
/// <param name="DeclinesAndTimeouts">Orders where driver was assigned then the order was cancelled (driver-declined) or timed out.</param>
/// <param name="Cancellations">Orders cancelled by any role after the driver accepted (arrived or started).</param>
/// <param name="NoShows">Orders cancelled with arrived_at set (driver arrived but customer no-showed).</param>
/// <param name="AvgRating">Average customer rating (1–5) for rated completed rides. Null when no ratings.</param>
public record DriverLeagueRowDto(
    Guid DriverId,
    string Name,
    int RidesCompleted,
    int RevenueCzk,
    double OnlineHours,
    double UtilizationPct,
    double RevenuePerOnlineHour,
    double AcceptanceRate,
    double AvgTimeToAcceptSeconds,
    int DeclinesAndTimeouts,
    int Cancellations,
    int NoShows,
    double? AvgRating);

/// <summary>Driver retention counts for one ISO calendar week.</summary>
/// <param name="WeekStart">ISO week Monday in yyyy-MM-dd format.</param>
/// <param name="Active">Drivers with at least 1 completed ride in the week.</param>
/// <param name="NewlyActivated">Drivers whose first-ever completed ride is in this week.</param>
/// <param name="Churned">Drivers active in prior weeks who had no completed ride in the trailing 14 days ending at week end.</param>
public record RetentionBucketDto(
    string WeekStart,
    int Active,
    int NewlyActivated,
    int Churned);
