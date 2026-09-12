using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Features.Zones.ListZones;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Zones.UpdateZone;

/// <summary>Updates a zone (full PUT update, FleetAdmin only). A cross-fleet id returns a no-leak 404.</summary>
internal sealed class UpdateZoneEndpoint(TaxiDbContext dbContext)
    : Endpoint<UpdateZoneRequest, ZoneDto>
{
    private readonly ZonesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Put("zones/{id:guid}");
        Description(builder => builder
            .WithName(nameof(UpdateZoneEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Update a zone";
            s.Description = "Full update of a zone (may switch shape). FleetAdmin only. Cross-fleet id returns 404.";
            s.Responses[StatusCodes.Status200OK] = "Zone updated.";
            s.Responses[StatusCodes.Status400BadRequest] = "Validation error.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Zone not found or not in this fleet.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(UpdateZoneRequest req, CancellationToken ct)
    {
        var zone = await dbContext.Zones.FirstOrDefaultAsync(z => z.Id == req.Id, ct);

        if (zone is null) { await Send.NotFoundAsync(ct); return; }

        var shape = ZoneWriteMapper.ParseShape(req.Shape)!.Value; // validator guarantees a valid shape

        // Dispose the previous polygon document before replacing it.
        zone.Polygon?.Dispose();

        zone.Name = req.Name;
        zone.Shape = shape;
        zone.CenterLat = req.CenterLat;
        zone.CenterLng = req.CenterLng;
        zone.RadiusMeters = shape == ZoneShape.Circle ? req.RadiusMeters : null;
        zone.Polygon = shape == ZoneShape.Polygon ? ZoneWriteMapper.BuildPolygon(req.Polygon) : null;
        zone.IsEnabled = req.IsEnabled;

        await dbContext.SaveChangesAsync(ct);

        await Send.OkAsync(
            new ZoneDto(
                zone.Id, zone.Name, zone.Shape.ToString(), zone.CenterLat, zone.CenterLng,
                zone.RadiusMeters, ZonePolygonMapper.ToArray(zone.Polygon), zone.IsEnabled),
            ct);
    }
}
