namespace Taxi.Api.Features.Analytics.GetOverview;

/// <summary>Response envelope for GET /api/v1/analytics/overview.</summary>
/// <param name="Current">KPI cards for the requested period.</param>
/// <param name="Prior">KPI cards for the prior equal-length period (null when compare=false).</param>
/// <param name="Deltas">Absolute deltas (current − prior) per KPI (null when compare=false).</param>
/// <param name="Series">Rides + revenue per granularity bucket, ordered chronologically.</param>
public record GetOverviewResponse(
    OverviewKpiDto Current,
    OverviewKpiDto? Prior,
    OverviewDeltaDto? Deltas,
    List<TrendBucketDto> Series);

/// <summary>KPI cards for one analytics period (current or prior).</summary>
/// <param name="Rides">Number of completed rides.</param>
/// <param name="RevenueCzk">Gross revenue from completed rides (integer CZK).</param>
/// <param name="Aov">Average order value in CZK (0 when no rides).</param>
/// <param name="FulfillmentRate">Fraction of all orders that completed (0.0–1.0).</param>
/// <param name="CancellationRate">Fraction of all orders that were cancelled (0.0–1.0).</param>
/// <param name="ActiveCustomers">Distinct customers (by customer_user_id) with at least one completed order.</param>
/// <param name="NewCustomers">Customers with exactly one completed order in this period (new-customer proxy).</param>
/// <param name="ActiveDrivers">Distinct drivers (by driver_id) with at least one completed order.</param>
/// <param name="OnlineDriverHours">Sum of closed driver shift durations in hours.</param>
/// <param name="RevenuePerOnlineHour">Gross revenue divided by online driver-hours (0 when no hours).</param>
/// <param name="AvgRating">Average rating stars across rated completed orders (null when no ratings).</param>
public record OverviewKpiDto(
    int Rides,
    int RevenueCzk,
    int Aov,
    double FulfillmentRate,
    double CancellationRate,
    int ActiveCustomers,
    int NewCustomers,
    int ActiveDrivers,
    double OnlineDriverHours,
    double RevenuePerOnlineHour,
    double? AvgRating);

/// <summary>Absolute deltas (current − prior) for each KPI when compare=true.</summary>
/// <param name="Rides">Delta: completed rides.</param>
/// <param name="RevenueCzk">Delta: gross revenue (CZK).</param>
/// <param name="Aov">Delta: average order value (CZK).</param>
/// <param name="FulfillmentRate">Delta: fulfillment rate.</param>
/// <param name="CancellationRate">Delta: cancellation rate.</param>
/// <param name="ActiveCustomers">Delta: active customers.</param>
/// <param name="NewCustomers">Delta: new customers.</param>
/// <param name="ActiveDrivers">Delta: active drivers.</param>
/// <param name="OnlineDriverHours">Delta: online driver-hours.</param>
/// <param name="RevenuePerOnlineHour">Delta: revenue per online hour.</param>
/// <param name="AvgRating">Delta: avg rating (null when either period has no ratings).</param>
public record OverviewDeltaDto(
    int Rides,
    int RevenueCzk,
    int Aov,
    double FulfillmentRate,
    double CancellationRate,
    int ActiveCustomers,
    int NewCustomers,
    int ActiveDrivers,
    double OnlineDriverHours,
    double RevenuePerOnlineHour,
    double? AvgRating);

/// <summary>One granularity bucket in the trend series.</summary>
/// <param name="Bucket">ISO 8601 date string (yyyy-MM-dd) representing the bucket start.</param>
/// <param name="Rides">Completed rides in this bucket.</param>
/// <param name="RevenueCzk">Gross revenue in this bucket (integer CZK).</param>
public record TrendBucketDto(string Bucket, int Rides, int RevenueCzk);
