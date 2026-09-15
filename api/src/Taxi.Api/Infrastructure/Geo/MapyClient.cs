using System.Globalization;
using System.Net.Http.Json;
using Microsoft.Extensions.Logging;
using Polly.CircuitBreaker;

namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Typed HTTP client for the Mapy.com REST API.
/// All methods map infrastructure failures (timeout, retry-exhausted 5xx, circuit-open) to
/// <see cref="GeoResult{T}.Unavailable"/> internally — never throw for degradation, never return null.
/// The server key is resolved per-call via <see cref="MapyKeyResolver"/> and is NEVER logged.</summary>
internal sealed class MapyClient(
    HttpClient httpClient,
    MapyKeyResolver keyResolver,
    ILogger<MapyClient> logger) : IMapyClient
{
    private const int MaxGeometryPoints = 200;

    // Mapy.com type filter for suggest — address + street + POI
    private const string SuggestTypes = "regional.address,regional.street,poi";

    /// <inheritdoc />
    public Task<GeoResult<IReadOnlyList<MapySuggestResult>>> SuggestAsync(
        string query, CancellationToken ct)
    {
        var key = keyResolver.Resolve(null);
        var url = $"v1/suggest?apikey={key}&lang=cs&type={SuggestTypes}&limit=5&query={Uri.EscapeDataString(query)}";
        return ExecuteAsync<MapySuggestResponse, IReadOnlyList<MapySuggestResult>>(
            url,
            static response => ParseSuggestItems(response),
            "suggest",
            ct);
    }

    /// <inheritdoc />
    public Task<GeoResult<MapyGeocodeResult>> GeocodeAsync(string query, CancellationToken ct)
    {
        var key = keyResolver.Resolve(null);
        var url = $"v1/geocode?apikey={key}&lang=cs&query={Uri.EscapeDataString(query)}";
        return ExecuteAsync<MapyGeocodeResponse, MapyGeocodeResult>(
            url,
            static response =>
            {
                var first = response.Items.FirstOrDefault();
                if (first is null) return new MapyGeocodeResult(false, null, null, null);
                return new MapyGeocodeResult(true, first.Label, first.Position?.Lat, first.Position?.Lon);
            },
            "geocode",
            ct);
    }

    /// <inheritdoc />
    public Task<GeoResult<MapyRgeocodeResult>> ReverseGeocodeAsync(
        double lat, double lng, CancellationToken ct)
    {
        var key = keyResolver.Resolve(null);
        var ic = CultureInfo.InvariantCulture;
        var url = $"v1/rgeocode?apikey={key}&lang=cs&lat={lat.ToString(ic)}&lon={lng.ToString(ic)}";
        return ExecuteAsync<MapyRgeocodeResponse, MapyRgeocodeResult>(
            url,
            static response =>
            {
                var first = response.Items.FirstOrDefault();
                if (first is null) return new MapyRgeocodeResult(false, null, null, null);
                var street = first.RegionalStructure
                    .FirstOrDefault(r => r.Type == "regional.street")?.Name;
                var municipality = first.RegionalStructure
                    .FirstOrDefault(r => r.Type == "regional.municipality")?.Name;
                return new MapyRgeocodeResult(true, first.Label, street, municipality);
            },
            "rgeocode",
            ct);
    }

    /// <inheritdoc />
    public Task<GeoResult<MapyRouteResultData>> RouteAsync(
        double fromLat, double fromLng, double toLat, double toLng, CancellationToken ct)
    {
        var key = keyResolver.Resolve(null);
        var ic = CultureInfo.InvariantCulture;
        var url = $"v1/routing/route?apikey={key}&lang=cs&routeType=car_fast" +
                  $"&start={fromLng.ToString(ic)},{fromLat.ToString(ic)}" +
                  $"&end={toLng.ToString(ic)},{toLat.ToString(ic)}";
        return ExecuteAsync<MapyRouteResponse, MapyRouteResultData>(
            url,
            static response =>
            {
                var route = response.Route
                    ?? throw new InvalidOperationException("Mapy route response contained no route");
                return new MapyRouteResultData(
                    (int)Math.Round(route.Length),
                    (int)Math.Round(route.Duration),
                    SimplifyGeometry(route.Geometry));
            },
            "route",
            ct);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /// <summary>Executes an HTTP GET against the Mapy API, handles resilience exceptions,
    /// and maps the result to a <see cref="GeoResult{T}"/>.</summary>
    private async Task<GeoResult<TResult>> ExecuteAsync<TResponse, TResult>(
        string url,
        Func<TResponse, TResult> parser,
        string operation,
        CancellationToken ct)
        where TResponse : class
    {
        try
        {
            var response = await httpClient.GetAsync(url, ct);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Mapy upstream {Operation} returned non-success {StatusCode}",
                    operation, (int)response.StatusCode);
                return new GeoResult<TResult>.Unavailable(GeoUnavailableReason.ServerError);
            }

            var dto = await response.Content.ReadFromJsonAsync<TResponse>(cancellationToken: ct);
            if (dto is null)
            {
                logger.LogWarning("Mapy upstream {Operation} returned null body", operation);
                return new GeoResult<TResult>.Unavailable(GeoUnavailableReason.ServerError);
            }

            var value = parser(dto);
            return new GeoResult<TResult>.Success(value);
        }
        catch (BrokenCircuitException)
        {
            logger.LogWarning("Mapy circuit breaker open for {Operation}", operation);
            return new GeoResult<TResult>.Unavailable(GeoUnavailableReason.CircuitOpen);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Caller cancelled — propagate, not an infra failure
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Mapy upstream {Operation} failed", operation);
            return new GeoResult<TResult>.Unavailable(GeoUnavailableReason.Timeout);
        }
    }

    private static IReadOnlyList<MapySuggestResult> ParseSuggestItems(MapySuggestResponse response)
        => response.Items
            .Where(item => item.Position is not null)
            .Select(item =>
            {
                var street = item.RegionalStructure
                    .FirstOrDefault(r => r.Type == "regional.street")?.Name;
                var municipality = item.RegionalStructure
                    .FirstOrDefault(r => r.Type == "regional.municipality")?.Name;
                return new MapySuggestResult(item.Label, street, municipality,
                    item.Position!.Lat, item.Position!.Lon);
            })
            .ToList();

    /// <summary>Stride-downsamples the route geometry to at most <see cref="MaxGeometryPoints"/> points,
    /// always preserving the first and last point.</summary>
    private static IReadOnlyList<MapyGeoPoint> SimplifyGeometry(List<MapyRouteGeometryPoint> points)
    {
        if (points.Count <= MaxGeometryPoints)
            return points.Select(p => new MapyGeoPoint(p.Lat, p.Lon)).ToList();

        var result = new List<MapyGeoPoint>(MaxGeometryPoints);
        var stride = (points.Count - 1) / (double)(MaxGeometryPoints - 1);

        for (int i = 0; i < MaxGeometryPoints; i++)
        {
            var idx = Math.Min((int)Math.Round(i * stride), points.Count - 1);
            result.Add(new MapyGeoPoint(points[idx].Lat, points[idx].Lon));
        }

        return result;
    }
}
