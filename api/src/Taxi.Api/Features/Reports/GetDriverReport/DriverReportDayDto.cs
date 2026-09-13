namespace Taxi.Api.Features.Reports.GetDriverReport;

/// <summary>One Europe/Prague calendar day of a driver's aggregated activity.</summary>
/// <param name="Date">The Prague calendar day as <c>yyyy-MM-dd</c>.</param>
/// <param name="RidesCompleted">Count of Completed orders on this day.</param>
/// <param name="RidesCancelled">Count of no-show cancellations (cancelled by the driver) on this day.</param>
/// <param name="CashCzk">Sum of final prices (CZK) for Cash-paid completed orders.</param>
/// <param name="CardCzk">Sum of final prices (CZK) for Card-paid completed orders.</param>
/// <param name="InvoiceCzk">Sum of final prices (CZK) for Invoice-paid completed orders.</param>
/// <param name="TotalCzk">Sum of final prices (CZK) across all completed orders.</param>
/// <param name="HoursOnline">Hours the driver was online (clamped to the window), rounded to 2 dp.</param>
/// <param name="PriceOverrideCount">Count of completed orders with a non-null price-override reason.</param>
public record DriverReportDayDto(
    string Date,
    int RidesCompleted,
    int RidesCancelled,
    int CashCzk,
    int CardCzk,
    int InvoiceCzk,
    int TotalCzk,
    double HoursOnline,
    int PriceOverrideCount);
