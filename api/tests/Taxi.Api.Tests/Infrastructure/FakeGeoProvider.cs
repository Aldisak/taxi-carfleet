using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Tests.Infrastructure;

/// <summary>Controllable fake for <see cref="IGeoProvider"/> used in integration tests.
/// Tests set <see cref="SuggestResult"/>/<see cref="RouteResult"/> before each call;
/// set <see cref="SuggestShouldThrow"/>/<see cref="RouteShouldThrow"/> to simulate upstream failure.</summary>
public sealed class FakeGeoProvider : IGeoProvider
{
    /// <summary>Result returned by <see cref="SuggestAsync"/>. Defaults to empty.</summary>
    public IReadOnlyList<GeoSuggestItem> SuggestResult { get; set; } = [];

    /// <summary>When true, <see cref="SuggestAsync"/> throws <see cref="HttpRequestException"/>.</summary>
    public bool SuggestShouldThrow { get; set; }

    /// <summary>Result returned by <see cref="RouteAsync"/>.</summary>
    public GeoRouteResult? RouteResult { get; set; }

    /// <summary>When true, <see cref="RouteAsync"/> throws <see cref="HttpRequestException"/>.</summary>
    public bool RouteShouldThrow { get; set; }

    /// <summary>Resets all state to defaults between tests.</summary>
    public void Reset()
    {
        SuggestResult = [];
        SuggestShouldThrow = false;
        RouteResult = null;
        RouteShouldThrow = false;
    }

    /// <inheritdoc />
    public Task<IReadOnlyList<GeoSuggestItem>> SuggestAsync(string query, CancellationToken ct)
    {
        if (SuggestShouldThrow)
            throw new HttpRequestException("Fake upstream unavailable");
        return Task.FromResult(SuggestResult);
    }

    /// <inheritdoc />
    public Task<GeoRouteResult> RouteAsync(double fromLat, double fromLng, double toLat, double toLng, CancellationToken ct)
    {
        if (RouteShouldThrow)
            throw new HttpRequestException("Fake upstream unavailable");
        return Task.FromResult(RouteResult ?? new GeoRouteResult(1000, 120));
    }
}
