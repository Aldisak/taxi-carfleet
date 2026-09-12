using System.Text.Json;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Zones.ListZones;

/// <summary>Lists all zones in the current fleet (FleetAdmin only). The jsonb Polygon is materialized
/// with ToListAsync() first, then read in memory (never projected in a LINQ Select — CLAUDE.md WI-10).</summary>
internal sealed class ListZonesEndpoint(TaxiDbContext dbContext)
    : EndpointWithoutRequest<ListZonesResponse>
{
    private readonly ZonesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("zones");
        Description(builder => builder
            .WithName(nameof(ListZonesEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "List zones";
            s.Description = "Returns all zones in the current fleet with their shape data. FleetAdmin only.";
            s.Responses[StatusCodes.Status200OK] = "List of zones.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        // Materialize first — the jsonb Polygon (JsonDocument) cannot be read inside a LINQ-to-SQL Select.
        var zones = await dbContext.Zones.AsNoTracking()
            .OrderBy(z => z.Name)
            .ToListAsync(ct);

        var dtos = zones
            .Select(z => new ZoneDto(
                z.Id,
                z.Name,
                z.Shape.ToString(),
                z.CenterLat,
                z.CenterLng,
                z.RadiusMeters,
                ZonePolygonMapper.ToArray(z.Polygon),
                z.IsEnabled))
            .ToList();

        await Send.OkAsync(new ListZonesResponse(dtos), ct);
    }
}

/// <summary>Converts a jsonb polygon <see cref="JsonDocument"/> into a <c>[lat,lng][]</c> array in memory.</summary>
internal static class ZonePolygonMapper
{
    /// <summary>Reads the polygon document into an array of [lat,lng] pairs, or null when absent/empty.</summary>
    public static double[][]? ToArray(JsonDocument? polygon)
    {
        if (polygon is null || polygon.RootElement.ValueKind != JsonValueKind.Array) return null;

        var result = new List<double[]>();
        foreach (var pair in polygon.RootElement.EnumerateArray())
        {
            if (pair.ValueKind != JsonValueKind.Array || pair.GetArrayLength() < 2) continue;
            result.Add([pair[0].GetDouble(), pair[1].GetDouble()]);
        }

        return result.Count == 0 ? null : [.. result];
    }
}
