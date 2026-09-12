using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Routes.ListRoutes;

/// <summary>Lists non-deleted routes in the current fleet ordered by priority descending (FleetAdmin only).
/// This is the administrative editor listing; <c>routes/common</c> remains the anonymous customer listing.</summary>
internal sealed class ListRoutesEndpoint(TaxiDbContext dbContext)
    : EndpointWithoutRequest<ListRoutesResponse>
{
    private readonly RoutesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("routes");
        Description(builder => builder
            .WithName(nameof(ListRoutesEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "List routes (admin)";
            s.Description = "Returns non-deleted routes in the current fleet ordered by priority descending. FleetAdmin only.";
            s.Responses[StatusCodes.Status200OK] = "List of routes.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        var routes = await dbContext.Routes.AsNoTracking()
            .Where(r => r.DeletedAt == null)
            .OrderByDescending(r => r.Priority)
            .Select(r => new RouteAdminDto(
                r.Id,
                r.Name,
                r.Type.ToString(),
                r.PriceCzk,
                r.FromZoneId,
                r.ToZoneId,
                r.FromLat,
                r.FromLng,
                r.ToLat,
                r.ToLng,
                r.FromRadiusMeters,
                r.ToRadiusMeters,
                r.IsBidirectional,
                r.ValidDays,
                r.ValidFromTime,
                r.ValidToTime,
                r.Priority,
                r.IsEnabled))
            .ToListAsync(ct);

        await Send.OkAsync(new ListRoutesResponse(routes), ct);
    }
}
