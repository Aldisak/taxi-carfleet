namespace Taxi.Api.Features.Analytics.GetRevenue;

/// <summary>Response for GET /api/v1/analytics/revenue — revenue analytics for the fleet.</summary>
/// <param name="Series">Revenue per time bucket, stacked by payment type and split by order source / price type.</param>
/// <param name="AovTrend">Average order value (CZK) per time bucket for the window.</param>
/// <param name="PriceOverride">Impact of price overrides: count, total CZK delta, and top override reasons.</param>
/// <param name="TopRoutes">Top pickup→dropoff routes by total revenue in the window.</param>
/// <param name="ZoneRevenue">Revenue, ride count, and average value per zone (bounding-box pickup attribution).</param>
/// <param name="SmsCost">SMS cost line per time bucket (sent-SMS count × SmsUnitCostCzk from FleetSettings).</param>
/// <param name="Prior">All revenue sections recomputed for the prior equal-length period (null when compare=false).</param>
public record GetRevenueResponse(
    List<RevenueBucketDto> Series,
    List<AovTrendBucketDto> AovTrend,
    PriceOverrideImpactDto PriceOverride,
    List<RevenueTopRouteDto> TopRoutes,
    List<ZoneRevenueDto> ZoneRevenue,
    List<SmsCostBucketDto> SmsCost,
    GetRevenuePriorDto? Prior = null);

/// <summary>All revenue sections recomputed for the prior equal-length period (only when compare=true).</summary>
/// <param name="Series">Revenue per bucket for the prior period.</param>
/// <param name="AovTrend">AOV trend for the prior period.</param>
/// <param name="PriceOverride">Price-override impact for the prior period.</param>
/// <param name="TopRoutes">Top routes by revenue for the prior period.</param>
/// <param name="ZoneRevenue">Zone revenue for the prior period.</param>
/// <param name="SmsCost">SMS cost per bucket for the prior period.</param>
public record GetRevenuePriorDto(
    List<RevenueBucketDto> Series,
    List<AovTrendBucketDto> AovTrend,
    PriceOverrideImpactDto PriceOverride,
    List<RevenueTopRouteDto> TopRoutes,
    List<ZoneRevenueDto> ZoneRevenue,
    List<SmsCostBucketDto> SmsCost);

/// <summary>Revenue for one time bucket, stacked by payment type and split by order source and price type.</summary>
/// <param name="Bucket">Bucket start date (yyyy-MM-dd) from date_trunc.</param>
/// <param name="TotalCzk">Total completed revenue in CZK for this bucket.</param>
/// <param name="Rides">Number of completed rides in this bucket.</param>
/// <param name="CashCzk">Revenue from cash payment orders.</param>
/// <param name="CardCzk">Revenue from card payment orders.</param>
/// <param name="InvoiceCzk">Revenue from invoice (account) payment orders.</param>
/// <param name="AppCzk">Revenue from app-source orders (OrderSource=App).</param>
/// <param name="PhoneCzk">Revenue from phone-source orders (OrderSource=Phone).</param>
/// <param name="DispatcherCzk">Revenue from dispatcher-created orders (OrderSource=Dispatcher).</param>
/// <param name="MeterCzk">Revenue from meter-priced orders.</param>
/// <param name="FixedCzk">Revenue from fixed-price orders.</param>
/// <param name="EstimateCzk">Revenue from estimate-price orders (PriceType=Estimate).</param>
public record RevenueBucketDto(
    string Bucket,
    int TotalCzk,
    int Rides,
    int CashCzk,
    int CardCzk,
    int InvoiceCzk,
    int AppCzk,
    int PhoneCzk,
    int DispatcherCzk,
    int MeterCzk,
    int FixedCzk,
    int EstimateCzk);

/// <summary>Average order value for one time bucket.</summary>
/// <param name="Bucket">Bucket start date (yyyy-MM-dd).</param>
/// <param name="AovCzk">Average final_price_czk of completed orders in this bucket (0 when no completed orders).</param>
public record AovTrendBucketDto(string Bucket, int AovCzk);

/// <summary>Aggregate impact of price overrides in the window.</summary>
/// <param name="Count">Number of completed orders where final price differed from the fixed/estimated price.</param>
/// <param name="TotalDeltaCzk">Sum of (FinalPriceCzk − reference price) across overridden orders (positive = higher than quoted).</param>
/// <param name="TopReasons">Most common override reasons by frequency.</param>
public record PriceOverrideImpactDto(int Count, int TotalDeltaCzk, List<OverrideReasonDto> TopReasons);

/// <summary>One price-override reason with its frequency count.</summary>
/// <param name="Reason">The override reason text.</param>
/// <param name="Count">Number of orders with this reason in the window.</param>
public record OverrideReasonDto(string Reason, int Count);

/// <summary>A top revenue-generating pickup→dropoff route.</summary>
/// <param name="PickupAddress">Pickup address string.</param>
/// <param name="DropoffAddress">Dropoff address string.</param>
/// <param name="Rides">Number of completed rides on this route in the window.</param>
/// <param name="RevenueCzk">Total revenue (CZK) on this route in the window.</param>
/// <param name="AovCzk">Average order value (CZK) on this route (0 when no rides).</param>
public record RevenueTopRouteDto(string PickupAddress, string DropoffAddress, int Rides, int RevenueCzk, int AovCzk);

/// <summary>Revenue, ride count, and average value for one zone (bounding-box pickup attribution).</summary>
/// <param name="ZoneId">Zone entity ID.</param>
/// <param name="ZoneName">Zone display name.</param>
/// <param name="Rides">Number of completed rides with a pickup inside the zone bounding box.</param>
/// <param name="RevenueCzk">Total revenue from those rides.</param>
/// <param name="AovCzk">Average order value across those rides (0 when no rides).</param>
public record ZoneRevenueDto(Guid ZoneId, string ZoneName, int Rides, int RevenueCzk, int AovCzk);

/// <summary>SMS cost for one time bucket.</summary>
/// <param name="Bucket">Bucket start date (yyyy-MM-dd).</param>
/// <param name="SmsCount">Number of SMS notifications sent (Channel=Sms, Status=Sent) with CreatedAt in this bucket.</param>
/// <param name="CostCzk">SmsCount × SmsUnitCostCzk from FleetSettings (1 CZK default if no FleetSettings row).</param>
public record SmsCostBucketDto(string Bucket, int SmsCount, int CostCzk);
