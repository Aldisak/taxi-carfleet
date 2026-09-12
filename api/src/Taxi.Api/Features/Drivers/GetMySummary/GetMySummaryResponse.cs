namespace Taxi.Api.Features.Drivers.GetMySummary;

/// <summary>Response DTO for a driver's daily summary.</summary>
public record GetMySummaryResponse(
    int RidesCount,
    int CashTotalCzk,
    int CardTotalCzk,
    int InvoiceTotalCzk,
    double HoursOnline);
