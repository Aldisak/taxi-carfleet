using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Settings.GetGeoUsage;

/// <summary>Returns the current fleet's month-to-date geo API credit usage and budget. FleetAdmin only.</summary>
internal sealed class GetGeoUsageEndpoint(TaxiDbContext dbContext, ICurrentTenant currentTenant, TimeProvider timeProvider)
    : EndpointWithoutRequest<GetGeoUsageResponse>
{
    private readonly SettingsFeatureConfiguration _featureConfiguration = new();

    private static readonly TimeZoneInfo PragueZone =
        TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague");

    /// <inheritdoc />
    public override void Configure()
    {
        Get("settings/geo-usage");
        Description(builder => builder
            .WithName(nameof(GetGeoUsageEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Get geo usage for the current month";
            s.Description = "Returns month-to-date geo API credit consumption and the fleet's monthly budget. FleetAdmin only.";
            s.Responses[StatusCodes.Status200OK] = "Geo usage metrics for the current Prague-local calendar month.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "No fleet resolved for the current request.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        var fleetId = currentTenant.FleetId;
        if (fleetId is null) { await Send.NotFoundAsync(ct); return; }

        // Prague-local calendar month window.
        var pragueNow = TimeZoneInfo.ConvertTime(timeProvider.GetUtcNow(), PragueZone);
        var year = pragueNow.Year;
        var month = pragueNow.Month;
        var monthStart = new DateOnly(year, month, 1);
        var monthEnd = monthStart.AddMonths(1);

        // Month-to-date credit sum (GeoUsage has no query filter — use explicit fleetId predicate).
        var creditsUsed = await dbContext.GeoUsage
            .IgnoreQueryFilters()
            .Where(u => u.FleetId == fleetId && u.Day >= monthStart && u.Day < monthEnd)
            .SumAsync(u => (int?)u.CreditsEst, ct) ?? 0;

        // Budget from FleetSettings (query-filter scoped to this fleet).
        var budget = await dbContext.FleetSettings
            .AsNoTracking()
            .Where(s => s.FleetId == fleetId)
            .Select(s => (int?)s.GeoMonthlyCreditBudget)
            .FirstOrDefaultAsync(ct)
            ?? 250_000;

        var usagePercent = budget > 0
            ? Math.Round((double)creditsUsed / budget * 100.0, 1)
            : 0.0;

        await Send.OkAsync(new GetGeoUsageResponse(
            creditsUsed,
            budget,
            usagePercent,
            year,
            month), ct);
    }
}
