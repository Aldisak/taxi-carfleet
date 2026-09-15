namespace Taxi.Api.Features.Settings.GetGeoUsage;

/// <summary>Response for the GET /settings/geo-usage endpoint.</summary>
/// <param name="CreditsUsedThisMonth">Sum of <c>credits_est</c> for the current Prague-local calendar month.</param>
/// <param name="CreditBudget">The fleet's configured monthly geo credit budget (<see cref="Taxi.Api.Infrastructure.Entities.FleetSettings.GeoMonthlyCreditBudget"/>).</param>
/// <param name="UsagePercent">Usage as a percentage of the budget, rounded to one decimal place. May exceed 100.</param>
/// <param name="Year">Prague-local calendar year of the reported month.</param>
/// <param name="Month">Prague-local calendar month of the reported data (1–12).</param>
public record GetGeoUsageResponse(
    int CreditsUsedThisMonth,
    int CreditBudget,
    double UsagePercent,
    int Year,
    int Month);
