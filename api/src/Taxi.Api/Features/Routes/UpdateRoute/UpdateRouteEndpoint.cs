using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Features.Routes.ListRoutes;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Routes.UpdateRoute;

/// <summary>Updates a route (full PUT update, FleetAdmin only). A cross-fleet or soft-deleted id returns
/// a no-leak 404. Editing a route's price does NOT retroactively change already-created orders (the
/// order row copied the price at creation) — see the A7 price-lock integration test.</summary>
internal sealed class UpdateRouteEndpoint(TaxiDbContext dbContext)
    : Endpoint<UpdateRouteRequest, RouteAdminDto>
{
    private readonly RoutesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Put("routes/{id:guid}");
        Description(builder => builder
            .WithName(nameof(UpdateRouteEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Update a route";
            s.Description = "Full update of a route. FleetAdmin only. Cross-fleet id returns 404.";
            s.Responses[StatusCodes.Status200OK] = "Route updated.";
            s.Responses[StatusCodes.Status400BadRequest] = "Validation error.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Route not found or not in this fleet.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(UpdateRouteRequest req, CancellationToken ct)
    {
        var route = await dbContext.Routes.FirstOrDefaultAsync(r => r.Id == req.Id && r.DeletedAt == null, ct);

        if (route is null) { await Send.NotFoundAsync(ct); return; }

        var type = RouteTypeValidation.ParseType(req.Type)!.Value; // validator guarantees a valid type

        route.Name = req.Name;
        route.Type = type;
        route.PriceCzk = req.PriceCzk;
        route.FromZoneId = req.FromZoneId;
        route.ToZoneId = type == RouteType.ZoneToZone ? req.ToZoneId : null;
        route.FromLat = req.FromLat;
        route.FromLng = req.FromLng;
        route.ToLat = type == RouteType.PointToPoint ? req.ToLat : null;
        route.ToLng = type == RouteType.PointToPoint ? req.ToLng : null;
        route.FromRadiusMeters = req.FromRadiusMeters;
        route.ToRadiusMeters = req.ToRadiusMeters;
        route.IsBidirectional = req.IsBidirectional;
        route.ValidDays = req.ValidDays;
        route.ValidFromTime = req.ValidFromTime;
        route.ValidToTime = req.ValidToTime;
        route.Priority = req.Priority;
        route.IsEnabled = req.IsEnabled;

        await dbContext.SaveChangesAsync(ct);

        await Send.OkAsync(
            new RouteAdminDto(
                route.Id, route.Name, route.Type.ToString(), route.PriceCzk,
                route.FromZoneId, route.ToZoneId, route.FromLat, route.FromLng, route.ToLat, route.ToLng,
                route.FromRadiusMeters, route.ToRadiusMeters, route.IsBidirectional,
                route.ValidDays, route.ValidFromTime, route.ValidToTime, route.Priority, route.IsEnabled),
            ct);
    }
}
