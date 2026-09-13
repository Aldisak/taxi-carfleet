using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Reports.GetRatings;

/// <summary>Returns the list of customer ratings (comment + order public code + driver name) for
/// completed, rated orders in the current fleet, newest first. FleetAdmin only, tenant-scoped.
/// Rangeless by design — the UI lists all available ratings; the driver report carries the per-driver
/// average for range-scoped analysis.</summary>
internal sealed class GetRatingsEndpoint(TaxiDbContext dbContext)
    : EndpointWithoutRequest<GetRatingsResponse>
{
    private const int MaxItems = 500;

    private readonly ReportsFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("reports/ratings");
        Description(builder => builder
            .WithName(nameof(GetRatingsEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Ratings list (FleetAdmin)";
            s.Description = "All rated completed orders for the fleet: star count, comment, order code, " +
                            "and driver name, newest first. Tenant-scoped.";
            s.Responses[StatusCodes.Status200OK] = "Ratings list.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        // Tenant-scoped via the Order global query filter. Join driver→user for the display name.
        var items = await dbContext.Orders.AsNoTracking()
            .Where(o => o.Status == OrderStatus.Completed && o.RatingStars != null)
            .OrderByDescending(o => o.RatedAt)
            .Take(MaxItems)
            .Select(o => new
            {
                o.PublicCode,
                o.DriverId,
                Stars = o.RatingStars!.Value,
                o.RatingComment,
                o.RatedAt
            })
            .ToListAsync(ct);

        // Resolve driver display names in one round-trip (no N+1).
        var driverIds = items.Where(i => i.DriverId != null).Select(i => i.DriverId!.Value).Distinct().ToList();
        var driverNames = await dbContext.Drivers.AsNoTracking()
            .Where(d => driverIds.Contains(d.Id))
            .Join(dbContext.Users.AsNoTracking(), d => d.UserId, u => u.Id, (d, u) => new { d.Id, u.DisplayName })
            .ToDictionaryAsync(x => x.Id, x => x.DisplayName, ct);

        var result = items
            .Select(i => new RatingDto(
                i.PublicCode,
                i.DriverId is Guid did && driverNames.TryGetValue(did, out var name) ? name : null,
                i.Stars,
                i.RatingComment,
                i.RatedAt))
            .ToList();

        await Send.OkAsync(new GetRatingsResponse(result), ct);
    }
}
