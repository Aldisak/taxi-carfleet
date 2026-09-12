using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Zones.CreateZone;

/// <summary>Creates a new zone in the current fleet (FleetAdmin only). The polygon coordinate array is
/// stored as jsonb via JsonDocument.Parse. The FleetId is stamped from the current tenant.</summary>
internal sealed class CreateZoneEndpoint(TaxiDbContext dbContext)
    : Endpoint<CreateZoneRequest, CreateZoneResponse>
{
    private readonly ZonesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("zones");
        Description(builder => builder
            .WithName(nameof(CreateZoneEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Create a zone";
            s.Description = "Creates a Circle (center + radius) or Polygon (3..200 [lat,lng] pairs) zone. FleetAdmin only.";
            s.Responses[StatusCodes.Status201Created] = "Zone created.";
            s.Responses[StatusCodes.Status400BadRequest] = "Validation error (shape mismatch, >200 points).";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CreateZoneRequest req, CancellationToken ct)
    {
        var shape = ZoneWriteMapper.ParseShape(req.Shape)!.Value; // validator guarantees a valid shape

        var zone = new Zone
        {
            Id = Guid.CreateVersion7(),
            Name = req.Name,
            Shape = shape,
            CenterLat = req.CenterLat,
            CenterLng = req.CenterLng,
            RadiusMeters = shape == ZoneShape.Circle ? req.RadiusMeters : null,
            Polygon = shape == ZoneShape.Polygon ? ZoneWriteMapper.BuildPolygon(req.Polygon) : null,
            IsEnabled = req.IsEnabled
        };
        dbContext.Zones.Add(zone);
        await dbContext.SaveChangesAsync(ct);

        await Send.ResponseAsync(new CreateZoneResponse(zone.Id), StatusCodes.Status201Created, ct);
    }
}
