using System.Text.Json;

namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Real geo provider: Photon for address suggestions, OSRM for route distance/duration.
/// Both use named HttpClients registered in <see cref="Taxi.Api.Features.Geo.GeoFeatureConfiguration"/>.</summary>
internal sealed class PhotonOsrmGeoProvider(IHttpClientFactory httpClientFactory) : IGeoProvider
{
    /// <inheritdoc />
    public async Task<IReadOnlyList<GeoSuggestItem>> SuggestAsync(string query, CancellationToken ct)
    {
        var http = httpClientFactory.CreateClient("photon");
        var response = await http.GetAsync($"api/?q={Uri.EscapeDataString(query)}&limit=5", ct);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

        var items = new List<GeoSuggestItem>();
        if (!doc.RootElement.TryGetProperty("features", out var features)) return items;

        foreach (var feature in features.EnumerateArray())
        {
            if (!feature.TryGetProperty("geometry", out var geometry)) continue;
            if (!feature.TryGetProperty("properties", out var props)) continue;
            if (!geometry.TryGetProperty("coordinates", out var coords)) continue;

            // Photon returns [lng, lat]
            if (coords.GetArrayLength() < 2) continue;
            var lng = coords[0].GetDouble();
            var lat = coords[1].GetDouble();

            var label = BuildLabel(props);
            items.Add(new GeoSuggestItem(label, lat, lng));
        }

        return items;
    }

    /// <inheritdoc />
    public async Task<GeoRouteResult> RouteAsync(
        double fromLat, double fromLng, double toLat, double toLng, CancellationToken ct)
    {
        var http = httpClientFactory.CreateClient("osrm");
        // OSRM expects lng,lat order
        var url = $"route/v1/driving/{fromLng},{fromLat};{toLng},{toLat}?overview=false";
        var response = await http.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

        var route = doc.RootElement.GetProperty("routes")[0];
        var distance = (int)Math.Round(route.GetProperty("distance").GetDouble());
        var duration = (int)Math.Round(route.GetProperty("duration").GetDouble());

        return new GeoRouteResult(distance, duration);
    }

    private static string BuildLabel(JsonElement props)
    {
        var parts = new List<string>();
        if (props.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String)
            parts.Add(name.GetString()!);
        if (props.TryGetProperty("city", out var city) && city.ValueKind == JsonValueKind.String)
            parts.Add(city.GetString()!);
        if (props.TryGetProperty("country", out var country) && country.ValueKind == JsonValueKind.String)
            parts.Add(country.GetString()!);
        return parts.Count > 0 ? string.Join(", ", parts) : "Unknown";
    }
}
