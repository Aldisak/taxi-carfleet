using System.Text.Json.Serialization;

namespace Taxi.Api.Infrastructure.Geo;

// ── Suggest response DTOs ────────────────────────────────────────────────────

/// <summary>Root of the Mapy.com /v1/suggest response.</summary>
internal sealed class MapySuggestResponse
{
    /// <summary>Suggested items.</summary>
    [JsonPropertyName("items")]
    public List<MapySuggestItem> Items { get; init; } = [];
}

/// <summary>A single suggest item from the Mapy.com /v1/suggest response.</summary>
internal sealed class MapySuggestItem
{
    /// <summary>Human-readable full label.</summary>
    [JsonPropertyName("label")]
    public string Label { get; init; } = string.Empty;

    /// <summary>Geographic position.</summary>
    [JsonPropertyName("position")]
    public MapyPosition? Position { get; init; }

    /// <summary>Structured regional information (street, municipality, etc.).</summary>
    [JsonPropertyName("regionalStructure")]
    public List<MapyRegionalStructureItem> RegionalStructure { get; init; } = [];
}

/// <summary>Position coordinates returned by Mapy.com.</summary>
internal sealed class MapyPosition
{
    /// <summary>Latitude.</summary>
    [JsonPropertyName("lat")]
    public double Lat { get; init; }

    /// <summary>Longitude.</summary>
    [JsonPropertyName("lon")]
    public double Lon { get; init; }
}

/// <summary>One level in the regional address hierarchy.</summary>
internal sealed class MapyRegionalStructureItem
{
    /// <summary>Type discriminator, e.g. "regional.street", "regional.municipality".</summary>
    [JsonPropertyName("type")]
    public string Type { get; init; } = string.Empty;

    /// <summary>Human-readable name for this level.</summary>
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;
}

// ── Geocode / reverse-geocode response DTOs ───────────────────────────────────

/// <summary>Root of the Mapy.com /v1/geocode response.</summary>
internal sealed class MapyGeocodeResponse
{
    /// <summary>Matched items.</summary>
    [JsonPropertyName("items")]
    public List<MapySuggestItem> Items { get; init; } = [];
}

/// <summary>Root of the Mapy.com /v1/rgeocode response.</summary>
internal sealed class MapyRgeocodeResponse
{
    /// <summary>Matched items (first is closest).</summary>
    [JsonPropertyName("items")]
    public List<MapySuggestItem> Items { get; init; } = [];
}

// ── Routing response DTOs ─────────────────────────────────────────────────────

/// <summary>Root of the Mapy.com /v1/routing/route response.</summary>
internal sealed class MapyRouteResponse
{
    /// <summary>Calculated route.</summary>
    [JsonPropertyName("route")]
    public MapyRoute? Route { get; init; }
}

/// <summary>A calculated route from Mapy.com routing.</summary>
internal sealed class MapyRoute
{
    /// <summary>Total route length in metres.</summary>
    [JsonPropertyName("length")]
    public double Length { get; init; }

    /// <summary>Estimated travel duration in seconds.</summary>
    [JsonPropertyName("duration")]
    public double Duration { get; init; }

    /// <summary>Route geometry as a sequence of coordinate pairs.</summary>
    [JsonPropertyName("geometry")]
    public List<MapyRouteGeometryPoint> Geometry { get; init; } = [];
}

/// <summary>A point on the route geometry polyline.</summary>
internal sealed class MapyRouteGeometryPoint
{
    /// <summary>Latitude.</summary>
    [JsonPropertyName("lat")]
    public double Lat { get; init; }

    /// <summary>Longitude.</summary>
    [JsonPropertyName("lon")]
    public double Lon { get; init; }
}
