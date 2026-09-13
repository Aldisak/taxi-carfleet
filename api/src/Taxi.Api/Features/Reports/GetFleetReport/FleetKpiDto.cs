namespace Taxi.Api.Features.Reports.GetFleetReport;

/// <summary>Top-level fleet KPIs for a date range, all computed server-side.</summary>
/// <param name="Rides">Total completed rides in range.</param>
/// <param name="RevenueCzk">Sum of final prices (CZK) for completed rides.</param>
/// <param name="AvgPriceCzk">Average final price (CZK) per completed ride; 0 when no rides.</param>
/// <param name="AvgTimeToAssignSeconds">Average seconds from creation to assignment; null when none.</param>
/// <param name="AvgTimeToPickupSeconds">Average seconds from acceptance to arrival; null when none.</param>
/// <param name="CancellationRate">Cancelled orders / total orders in range (0..1); 0 when none.</param>
/// <param name="AppOrders">Count of orders placed via the app.</param>
/// <param name="PhoneOrders">Count of orders placed by phone or dispatcher.</param>
/// <param name="FixedRouteOrders">Count of orders priced by a common route (RouteId set).</param>
/// <param name="SmsCount">Count of SMS notifications sent in range.</param>
/// <param name="SmsCostCzk">Estimated SMS cost (CZK) = SmsCount * per-SMS unit cost.</param>
public record FleetKpiDto(
    int Rides,
    int RevenueCzk,
    int AvgPriceCzk,
    double? AvgTimeToAssignSeconds,
    double? AvgTimeToPickupSeconds,
    double CancellationRate,
    int AppOrders,
    int PhoneOrders,
    int FixedRouteOrders,
    int SmsCount,
    int SmsCostCzk);
