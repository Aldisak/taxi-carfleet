using System.Globalization;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Analytics.GetDriverDrilldown;

/// <summary>Returns the driver drill-down: weekly rides/revenue/rating trend and recent low-rated orders
/// (rating ≤ 3) for coaching purposes. Returns 404 if the driver ID is not found in the current fleet.</summary>
internal sealed class GetDriverDrilldownEndpoint(TaxiDbContext dbContext, ICurrentTenant currentTenant, TimeProvider timeProvider)
    : Endpoint<GetDriverDrilldownRequest, GetDriverDrilldownResponse>
{
    private readonly AnalyticsFeatureConfiguration _featureConfiguration = new();

    private const int LowRatedThreshold = 3;
    private const int LowRatedLimit = 20;

    /// <inheritdoc />
    public override void Configure()
    {
        Get("analytics/drivers/{id:guid}");
        Description(builder => builder
            .WithName(nameof(GetDriverDrilldownEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Driver drill-down: weekly trend + low-rated orders (FleetAdmin)";
            s.Description =
                "Weekly rides, revenue, and avg rating trend for the driver in the analytics window. " +
                "Recent low-rated orders (≤ 3 stars) for coaching. " +
                "Returns 404 if the driver is not in the current fleet.";
            s.Responses[StatusCodes.Status200OK] = "Driver drill-down analytics.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid date, range, or granularity.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Driver not found in current fleet.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(GetDriverDrilldownRequest req, CancellationToken ct)
    {
        if (currentTenant.FleetId is not Guid fleetId) { await Send.NotFoundAsync(ct); return; }

        // Tenant-isolation guard: verify driver belongs to this fleet (EF global filter applies).
        var driver = await dbContext.Drivers.AsNoTracking()
            .Where(d => d.Id == req.Id)
            .Join(dbContext.Users.AsNoTracking(),
                d => d.UserId,
                u => u.Id,
                (d, u) => new { d.Id, u.DisplayName })
            .FirstOrDefaultAsync(ct);

        if (driver is null) { await Send.NotFoundAsync(ct); return; }

        var (winStart, winEnd, _, _) =
            Shared.AnalyticsWindow.Resolve(req.From, req.To, false, timeProvider.GetUtcNow());

        var weeklyTrend = await ComputeWeeklyTrendAsync(fleetId, req.Id, winStart, winEnd, ct);
        var lowRated = await ComputeLowRatedOrdersAsync(fleetId, req.Id, winStart, winEnd, ct);

        await Send.OkAsync(new GetDriverDrilldownResponse(
            DriverId: driver.Id,
            Name: driver.DisplayName,
            WeeklyTrend: weeklyTrend,
            LowRatedOrders: lowRated), ct);
    }

    // ── Weekly trend ─────────────────────────────────────────────────────────

    private async Task<List<DriverWeeklyTrendDto>> ComputeWeeklyTrendAsync(
        Guid fleetId, Guid driverId,
        DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var rows = await dbContext.Database.SqlQuery<WeeklyTrendRow>(
            $"""
             SELECT date_trunc('week', completed_at AT TIME ZONE 'UTC')::date AS "weekstart",
                    COUNT(*)::int                                              AS "rides",
                    COALESCE(SUM(final_price_czk), 0)::int                    AS "revenue",
                    AVG(rating_stars::float8) FILTER (WHERE rating_stars IS NOT NULL) AS "avgrating"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND driver_id = {driverId}
               AND status = 'Completed'
               AND completed_at >= {winStart}
               AND completed_at < {winEnd}
             GROUP BY date_trunc('week', completed_at AT TIME ZONE 'UTC')
             ORDER BY 1
             """).ToListAsync(ct);

        return rows.Select(r => new DriverWeeklyTrendDto(
            WeekStart: r.Weekstart.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            RidesCompleted: r.Rides,
            RevenueCzk: r.Revenue,
            AvgRating: r.Avgrating)).ToList();
    }

    // ── Low-rated orders (≤ 3 stars) ─────────────────────────────────────────

    private async Task<List<LowRatedOrderDto>> ComputeLowRatedOrdersAsync(
        Guid fleetId, Guid driverId,
        DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        // Load in memory first to avoid JsonDocument projection issues (CLAUDE.md trap).
        var orders = await dbContext.Orders.AsNoTracking()
            .Where(o => o.FleetId == fleetId
                     && o.DriverId == driverId
                     && o.Status == Infrastructure.Entities.OrderStatus.Completed
                     && o.RatingStars != null
                     && o.RatingStars <= LowRatedThreshold
                     && o.CompletedAt >= winStart
                     && o.CompletedAt < winEnd)
            .OrderByDescending(o => o.CompletedAt)
            .Take(LowRatedLimit)
            .ToListAsync(ct);

        return orders.Select(o => new LowRatedOrderDto(
            OrderId: o.Id,
            CompletedAt: o.CompletedAt!.Value,
            RatingStars: o.RatingStars!.Value,
            RatingComment: o.RatingComment,
            PublicCode: o.PublicCode,
            PickupAddress: o.PickupAddress,
            DropoffAddress: o.DropoffAddress)).ToList();
    }

    // ── Internal SQL row types ────────────────────────────────────────────────

    /// <summary>Row shape for the weekly trend query.</summary>
    private sealed record WeeklyTrendRow(DateTime Weekstart, int Rides, int Revenue, double? Avgrating);
}
