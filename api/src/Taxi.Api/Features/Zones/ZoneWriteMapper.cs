using System.Text.Json;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Zones;

/// <summary>Helpers shared by the zone create/update endpoints for parsing the shape and
/// serializing the polygon coordinate array into the jsonb <see cref="JsonDocument"/>.</summary>
internal static class ZoneWriteMapper
{
    /// <summary>Parses a shape string ("Circle"/"Polygon") into the enum. Returns null when unrecognized.</summary>
    public static ZoneShape? ParseShape(string shape) =>
        Enum.TryParse<ZoneShape>(shape, ignoreCase: true, out var parsed) ? parsed : null;

    /// <summary>Builds a jsonb <see cref="JsonDocument"/> from a <c>[lat,lng][]</c> array, or null when absent.
    /// The caller owns the returned document's lifetime (EF disposes it with the entity on SaveChanges).</summary>
    public static JsonDocument? BuildPolygon(double[][]? polygon)
    {
        if (polygon is null) return null;
        return JsonDocument.Parse(JsonSerializer.Serialize(polygon));
    }
}
