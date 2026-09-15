using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Admin.GetGeoUsage;

/// <summary>Returns per-fleet geo usage totals (calls, credits, budget, percent) for the current
/// Prague calendar month across ALL fleets. SuperAdminOnly.
/// <para><b>IgnoreQueryFilters()</b> is intentional — this is a cross-tenant SuperAdmin view.</para></summary>
internal sealed class GetAdminGeoUsageEndpoint(TaxiDbContext dbContext, TimeProvider timeProvider)
    : EndpointWithoutRequest<GetAdminGeoUsageResponse>
{
    private static readonly TimeZoneInfo PragueZone =
        TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague");

    private readonly AdminFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("admin/geo-usage");
        Description(builder => builder.WithName(nameof(GetAdminGeoUsageEndpoint)).WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.SuperAdminOnly));

        Summary(s =>
        {
            s.Summary = "Geo usage per fleet (SuperAdmin)";
            s.Description = "Cross-tenant per-fleet geo API usage for the current Prague calendar month: " +
                            "calls, estimated credits, configured budget, and percent of budget used. " +
                            "Platform totals row included.";
            s.Responses[StatusCodes.Status200OK] = "Per-fleet geo usage table.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a SuperAdmin.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        var now = timeProvider.GetUtcNow();
        var pragueNow = TimeZoneInfo.ConvertTime(now, PragueZone);

        // Current month boundaries as DateOnly in Prague local — GeoUsage.Day is already Prague-local.
        var monthStart = new DateOnly(pragueNow.Year, pragueNow.Month, 1);
        var nextMonthStart = monthStart.AddMonths(1);

        // Load all active fleets (cross-tenant SuperAdmin view: IgnoreQueryFilters intentional).
        var fleets = await dbContext.Fleets
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(f => f.IsActive)
            .Select(f => new { f.Id, f.Name })
            .ToListAsync(ct);

        // Aggregate geo_usage for the current month across all fleets in one query.
        // GroupBy FleetId — plain LINQ, no raw SQL needed; avoids MAX(uuid) trap.
        var usageByFleet = await dbContext.GeoUsage
            .Where(u => u.Day >= monthStart && u.Day < nextMonthStart)
            .GroupBy(u => u.FleetId)
            .Select(g => new
            {
                FleetId = g.Key,
                TotalCalls = g.Sum(u => u.Calls),
                TotalCredits = g.Sum(u => u.CreditsEst)
            })
            .ToListAsync(ct);

        // Resolve per-fleet budgets. The (int?) cast prevents the 0-default trap for missing rows.
        var fleetIds = fleets.Select(f => f.Id).ToList();
        var budgets = await dbContext.FleetSettings
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(fs => fleetIds.Contains(fs.FleetId))
            .Select(fs => new { fs.FleetId, fs.GeoMonthlyCreditBudget })
            .ToListAsync(ct);

        var budgetByFleet = budgets.ToDictionary(b => b.FleetId, b => b.GeoMonthlyCreditBudget);
        var usageLookup = usageByFleet.ToDictionary(u => u.FleetId);

        const int defaultBudget = 250_000;

        var rows = fleets.Select(fleet =>
        {
            var usage = usageLookup.TryGetValue(fleet.Id, out var u) ? u : null;
            var credits = usage?.TotalCredits ?? 0;
            var calls = usage?.TotalCalls ?? 0;
            var budget = budgetByFleet.TryGetValue(fleet.Id, out var b) ? b : defaultBudget;
            var percent = budget > 0 ? Math.Round(credits / (double)budget * 100.0, 2) : 0.0;

            return new FleetGeoUsageRowDto(
                FleetId: fleet.Id,
                FleetName: fleet.Name,
                TotalCallsThisMonth: calls,
                CreditsEstThisMonth: credits,
                Budget: budget,
                PercentOfBudget: percent);
        }).ToList();

        var platformCredits = rows.Sum(r => r.CreditsEstThisMonth);
        var platformCalls = rows.Sum(r => r.TotalCallsThisMonth);

        await Send.OkAsync(new GetAdminGeoUsageResponse(rows, platformCredits, platformCalls), ct);
    }
}
