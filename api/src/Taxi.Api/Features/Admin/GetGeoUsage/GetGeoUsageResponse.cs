namespace Taxi.Api.Features.Admin.GetGeoUsage;

/// <summary>Response DTO for GET /api/v1/admin/geo-usage.</summary>
/// <param name="Fleets">Per-fleet geo usage rows for the current Prague calendar month.</param>
/// <param name="PlatformTotalCredits">Sum of estimated credits across all fleets this month.</param>
/// <param name="PlatformTotalCalls">Sum of API calls across all fleets this month.</param>
public sealed record GetAdminGeoUsageResponse(
    List<FleetGeoUsageRowDto> Fleets,
    int PlatformTotalCredits,
    int PlatformTotalCalls);

/// <summary>Per-fleet geo usage row in the SuperAdmin geo usage view.</summary>
/// <param name="FleetId">Fleet identifier.</param>
/// <param name="FleetName">Fleet display name.</param>
/// <param name="TotalCallsThisMonth">Total geo API calls made by this fleet in the current Prague month.</param>
/// <param name="CreditsEstThisMonth">Estimated credit consumption for this fleet in the current Prague month.</param>
/// <param name="Budget">Monthly credit budget configured for this fleet (defaults to 250 000).</param>
/// <param name="PercentOfBudget">Credits used as a percentage of the configured budget (0 if budget is 0).</param>
public sealed record FleetGeoUsageRowDto(
    Guid FleetId,
    string FleetName,
    int TotalCallsThisMonth,
    int CreditsEstThisMonth,
    int Budget,
    double PercentOfBudget);
