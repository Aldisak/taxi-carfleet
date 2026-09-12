using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using RouteEntity = Taxi.Api.Infrastructure.Entities.Route;

namespace Taxi.Api.Features.Routes.CreateRoute;

/// <summary>Creates a new pricing route in the current fleet (FleetAdmin only). The FleetId is stamped
/// from the current tenant. Per-type fields are validated by the validator.</summary>
internal sealed class CreateRouteEndpoint(TaxiDbContext dbContext)
    : Endpoint<CreateRouteRequest, CreateRouteResponse>
{
    private readonly RoutesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("routes");
        Description(builder => builder
            .WithName(nameof(CreateRouteEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Create a route";
            s.Description = "Creates a PointToPoint, Zone, or ZoneToZone pricing route. FleetAdmin only.";
            s.Responses[StatusCodes.Status201Created] = "Route created.";
            s.Responses[StatusCodes.Status400BadRequest] = "Validation error (type/field mismatch).";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CreateRouteRequest req, CancellationToken ct)
    {
        var type = RouteTypeValidation.ParseType(req.Type)!.Value; // validator guarantees a valid type

        var route = new RouteEntity
        {
            Id = Guid.CreateVersion7(),
            Name = req.Name,
            Type = type,
            PriceCzk = req.PriceCzk,
            FromZoneId = req.FromZoneId,
            ToZoneId = type == RouteType.ZoneToZone ? req.ToZoneId : null,
            FromLat = req.FromLat,
            FromLng = req.FromLng,
            ToLat = type == RouteType.PointToPoint ? req.ToLat : null,
            ToLng = type == RouteType.PointToPoint ? req.ToLng : null,
            FromRadiusMeters = req.FromRadiusMeters,
            ToRadiusMeters = req.ToRadiusMeters,
            IsBidirectional = req.IsBidirectional,
            ValidDays = req.ValidDays,
            ValidFromTime = req.ValidFromTime,
            ValidToTime = req.ValidToTime,
            Priority = req.Priority,
            IsEnabled = req.IsEnabled
        };
        dbContext.Routes.Add(route);
        await dbContext.SaveChangesAsync(ct);

        await Send.ResponseAsync(new CreateRouteResponse(route.Id), StatusCodes.Status201Created, ct);
    }
}
