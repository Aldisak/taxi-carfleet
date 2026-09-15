using Taxi.Api.Common.Geo;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Tests.Infrastructure;

/// <summary>Controllable fake for <see cref="IGeoService"/> used in integration tests.
/// Tests set <see cref="SuggestResult"/>/<see cref="RouteResult"/>/<see cref="GeocodeResult"/>/<see cref="ReverseResult"/> before each call;
/// set <see cref="SuggestShouldReturnUnavailable"/>/<see cref="RouteShouldReturnUnavailable"/>/<see cref="GeocodeShouldReturnUnavailable"/>/<see cref="ReverseShouldReturnUnavailable"/>
/// to simulate upstream failure (returns Unavailable, which callers map to 502 / empty list).
/// ALWAYS call <see cref="Reset"/> first in any test helper that configures this fake
/// (shared singleton across the test collection — CLAUDE.md UC-004 discipline).
/// <para><see cref="RouteCallCount"/> tracks how many times <see cref="RouteAsync"/> was called since the last <see cref="Reset"/>.</para></summary>
public sealed class FakeGeoService : IGeoService
{
    /// <summary>Number of times <see cref="RouteAsync"/> has been called since the last <see cref="Reset"/>.</summary>
    public int RouteCallCount { get; private set; }
    /// <summary>Result returned by <see cref="SuggestAsync"/>. Defaults to empty list.</summary>
    public IReadOnlyList<MapySuggestResult> SuggestResult { get; set; } = [];

    /// <summary>When true, <see cref="SuggestAsync"/> returns Unavailable instead of the suggest result.</summary>
    public bool SuggestShouldReturnUnavailable { get; set; }

    /// <summary>Controls whether <see cref="SuggestAsync"/> reports a cache hit.</summary>
    public bool SuggestWasHit { get; set; }

    /// <summary>Result returned by <see cref="RouteAsync"/>. Defaults to a 1000m/120s route.</summary>
    public MapyRouteResultData? RouteResult { get; set; }

    /// <summary>When true, <see cref="RouteAsync"/> returns Unavailable (IsEstimate=true) instead of RouteResult.</summary>
    public bool RouteShouldReturnUnavailable { get; set; }

    /// <summary>Result returned by <see cref="GeocodeAsync"/>. Defaults to null (Unavailable unless set).</summary>
    public MapyGeocodeResult? GeocodeResult { get; set; }

    /// <summary>When true, <see cref="GeocodeAsync"/> returns Unavailable instead of <see cref="GeocodeResult"/>.</summary>
    public bool GeocodeShouldReturnUnavailable { get; set; }

    /// <summary>Controls whether <see cref="GeocodeAsync"/> reports a cache hit.</summary>
    public bool GeocodeWasHit { get; set; }

    /// <summary>Result returned by <see cref="ReverseAsync"/>. Defaults to null (Unavailable unless set).</summary>
    public MapyRgeocodeResult? ReverseResult { get; set; }

    /// <summary>When true, <see cref="ReverseAsync"/> returns Unavailable instead of <see cref="ReverseResult"/>.</summary>
    public bool ReverseShouldReturnUnavailable { get; set; }

    /// <summary>Controls whether <see cref="ReverseAsync"/> reports a cache hit.</summary>
    public bool ReverseWasHit { get; set; }

    /// <summary>Captures the most recent <c>near</c> parameter passed to <see cref="SuggestAsync"/>.
    /// Reset() clears it to null. Tests can assert this was non-null when Near was passed.</summary>
    public (double Lat, double Lng)? LastSuggestNear { get; private set; }

    /// <summary>Resets all state to defaults. Call this FIRST in every test helper that configures this fake.</summary>
    public void Reset()
    {
        SuggestResult = [];
        SuggestShouldReturnUnavailable = false;
        SuggestWasHit = false;
        LastSuggestNear = null;
        RouteResult = null;
        RouteShouldReturnUnavailable = false;
        RouteCallCount = 0;
        GeocodeResult = null;
        GeocodeShouldReturnUnavailable = false;
        GeocodeWasHit = false;
        ReverseResult = null;
        ReverseShouldReturnUnavailable = false;
        ReverseWasHit = false;
    }

    /// <inheritdoc />
    public Task<GeoCacheResult<IReadOnlyList<MapySuggestResult>>> SuggestAsync(
        Guid fleetId, string q, (double Lat, double Lng)? near, CancellationToken ct)
    {
        LastSuggestNear = near;

        if (SuggestShouldReturnUnavailable)
        {
            return Task.FromResult(new GeoCacheResult<IReadOnlyList<MapySuggestResult>>(
                new GeoResult<IReadOnlyList<MapySuggestResult>>.Unavailable(GeoUnavailableReason.Timeout),
                WasHit: SuggestWasHit));
        }

        return Task.FromResult(new GeoCacheResult<IReadOnlyList<MapySuggestResult>>(
            new GeoResult<IReadOnlyList<MapySuggestResult>>.Success(SuggestResult),
            WasHit: SuggestWasHit));
    }

    /// <inheritdoc />
    public Task<GeoCacheResult<MapyGeocodeResult>> GeocodeAsync(Guid fleetId, string q, CancellationToken ct)
    {
        if (GeocodeShouldReturnUnavailable || GeocodeResult is null)
        {
            return Task.FromResult(new GeoCacheResult<MapyGeocodeResult>(
                new GeoResult<MapyGeocodeResult>.Unavailable(GeoUnavailableReason.Timeout),
                WasHit: GeocodeWasHit));
        }

        return Task.FromResult(new GeoCacheResult<MapyGeocodeResult>(
            new GeoResult<MapyGeocodeResult>.Success(GeocodeResult),
            WasHit: GeocodeWasHit));
    }

    /// <inheritdoc />
    public Task<GeoCacheResult<MapyRgeocodeResult>> ReverseAsync(
        Guid fleetId, double lat, double lng, CancellationToken ct)
    {
        if (ReverseShouldReturnUnavailable || ReverseResult is null)
        {
            return Task.FromResult(new GeoCacheResult<MapyRgeocodeResult>(
                new GeoResult<MapyRgeocodeResult>.Unavailable(GeoUnavailableReason.Timeout),
                WasHit: ReverseWasHit));
        }

        return Task.FromResult(new GeoCacheResult<MapyRgeocodeResult>(
            new GeoResult<MapyRgeocodeResult>.Success(ReverseResult),
            WasHit: ReverseWasHit));
    }

    /// <inheritdoc />
    public Task<GeoRouteServiceResult> RouteAsync(
        Guid fleetId, double fromLat, double fromLng, double toLat, double toLng, CancellationToken ct)
    {
        RouteCallCount++;

        if (RouteShouldReturnUnavailable)
        {
            // Mirror GeoService behaviour: degrade to haversine×1.3 estimate wrapped in Success,
            // so the cast to Success in callers is always safe (IsEstimate=true flags the degradation).
            var haversine = HaversineDistance.Meters(fromLat, fromLng, toLat, toLng);
            var roadMeters = (int)Math.Round(GeoEstimateFallback.RoadDistanceMeters(haversine));
            var durationSecs = (int)Math.Round(GeoEstimateFallback.DurationSeconds(roadMeters));
            return Task.FromResult(new GeoRouteServiceResult(
                new GeoResult<MapyRouteResultData>.Success(new MapyRouteResultData(roadMeters, durationSecs, [])),
                WasHit: false,
                IsEstimate: true));
        }

        var route = RouteResult ?? new MapyRouteResultData(1000, 120, []);
        return Task.FromResult(new GeoRouteServiceResult(
            new GeoResult<MapyRouteResultData>.Success(route),
            WasHit: false,
            IsEstimate: false));
    }

    /// <inheritdoc />
    public Task<GeoCacheResult<IReadOnlyList<MapySuggestResult>>> QuickPlaceAsync(
        Guid fleetId, string placeKey, CancellationToken ct)
    {
        return Task.FromResult(new GeoCacheResult<IReadOnlyList<MapySuggestResult>>(
            new GeoResult<IReadOnlyList<MapySuggestResult>>.Unavailable(GeoUnavailableReason.Timeout),
            WasHit: false));
    }
}
