using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Geo;
using Taxi.Api.Common.Security;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Integration tests that verify GeoService orchestration logic end-to-end:
/// cache-hit routing, Unavailable degradation, usage accounting, and QuickPlace isolation.
/// The real GeoService + GeoCache + GeoUsageRecorder are constructed manually so the assertions
/// run against the actual accounting path (FakeGeoService from TaxiApiFactory bypasses the cache).</summary>
[Collection(TestCollections.Database)]
public sealed class GeoServiceTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset PinnedNow =
        new DateTimeOffset(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    // ── helpers ───────────────────────────────────────────────────────────────

    /// <summary>Seeds a minimal fleet row so geo_usage FK constraints are satisfied.</summary>
    private async Task SeedFleetAsync(Guid fleetId, string slug, CancellationToken ct)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = slug,
            Name = "GeoServiceTest Fleet",
            Phone = "+420601000001",
            IsActive = true,
            CreatedAt = PinnedNow
        });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Reads the geo_usage total calls for a given fleet+kind from a fresh DB scope.</summary>
    private async Task<int?> ReadUsageCallsAsync(Guid fleetId, GeoCacheKind kind, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var row = await db.GeoUsage
            .AsNoTracking()
            .Where(u => u.FleetId == fleetId && u.Kind == kind)
            .FirstOrDefaultAsync(ct);
        return row?.Calls;
    }

    /// <summary>Builds a manually-wired GeoService over a fresh scoped DI scope.
    /// The IMapyClient is the provided fake — lets tests control Success vs Unavailable.</summary>
    private GeoService BuildGeoService(IServiceScope scope, IMapyClient mapyClient)
    {
        var cache = scope.ServiceProvider.GetRequiredService<GeoCache>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var keyResolver = scope.ServiceProvider.GetRequiredService<MapyKeyResolver>();
        return new GeoService(mapyClient, cache, db, keyResolver);
    }

    // ── Route_CacheHit_NoClientCallNoCredit ──────────────────────────────────

    /// <summary>On a cache hit, GeoService must return the cached value without calling the
    /// IMapyClient and without incrementing geo_usage.</summary>
    [Fact]
    public async Task Route_CacheHit_NoClientCallNoCredit()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, $"gsvc-hit-{fleetId:N}", ct);

        const double fromLat = 49.95, fromLng = 15.27, toLat = 50.02, toLng = 15.20;

        // Warm the cache with a direct GeoCache call (real client call → Success → cached).
        var fakeClient = new FakeMapyClient
        {
            RouteResult = new GeoResult<MapyRouteResultData>.Success(
                new MapyRouteResultData(4000, 350, []))
        };

        await using var warmScope = fixture.Factory.Services.CreateAsyncScope();
        var geoCache = warmScope.ServiceProvider.GetRequiredService<GeoCache>();
        var warmKey = GeoCacheKey.Route(fromLat, fromLng, toLat, toLng);
        await geoCache.GetOrAddAsync(fleetId, GeoCacheKind.Route, warmKey,
            async c => await Task.FromResult((GeoResult<MapyRouteResultData>)fakeClient.RouteResult),
            ct);

        // Verify usage = 1 after the warm (cache miss).
        var usageAfterWarm = await ReadUsageCallsAsync(fleetId, GeoCacheKind.Route, ct);
        usageAfterWarm.Should().Be(1, "the warm call was a cache miss and should record usage");

        // Now reset client so any call to it would return a different value.
        var countingClient = new CountingMapyClient();

        await using var callScope = fixture.Factory.Services.CreateAsyncScope();
        var geoService = BuildGeoService(callScope, countingClient);

        var result = await geoService.RouteAsync(fleetId, fromLat, fromLng, toLat, toLng, ct);

        // Must be a cache hit.
        result.WasHit.Should().BeTrue("the value was already in cache");

        // Must NOT have called the client.
        countingClient.RouteCalls.Should().Be(0, "a cache hit must never call IMapyClient");

        // Usage must still be 1 (not incremented again).
        var usageAfterHit = await ReadUsageCallsAsync(fleetId, GeoCacheKind.Route, ct);
        usageAfterHit.Should().Be(1, "a cache hit must not increment geo_usage");

        // Value should match what was cached.
        result.Result.Should().BeOfType<GeoResult<MapyRouteResultData>.Success>();
        var success = (GeoResult<MapyRouteResultData>.Success)result.Result;
        success.Value.DistanceMeters.Should().Be(4000);
    }

    // ── Route_ClientUnavailable_ReturnsHaversineEstimateFlaggedWider ─────────

    /// <summary>When IMapyClient.RouteAsync returns Unavailable, GeoService must return a degraded
    /// estimate based on haversine×1.3 and flag IsEstimate=true. Usage must NOT be incremented.</summary>
    [Fact]
    public async Task Route_ClientUnavailable_ReturnsHaversineEstimateFlaggedWider()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, $"gsvc-unavail-{fleetId:N}", ct);

        const double fromLat = 49.95, fromLng = 15.27, toLat = 50.02, toLng = 15.20;

        var unavailClient = new FakeMapyClient
        {
            RouteResult = new GeoResult<MapyRouteResultData>.Unavailable(GeoUnavailableReason.Timeout)
        };

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var geoService = BuildGeoService(scope, unavailClient);

        var result = await geoService.RouteAsync(fleetId, fromLat, fromLng, toLat, toLng, ct);

        // Usage must NOT have been incremented (Unavailable → no credit).
        var usage = await ReadUsageCallsAsync(fleetId, GeoCacheKind.Route, ct);
        usage.Should().BeNull("an Unavailable result must not create a geo_usage row");

        // Result must carry the degraded estimate.
        result.IsEstimate.Should().BeTrue("Unavailable route must return a haversine-based estimate");
        result.Result.Should().BeOfType<GeoResult<MapyRouteResultData>.Success>(
            "the degraded estimate is returned as Success with IsEstimate=true");

        // The distance should be the haversine × 1.3 road factor (rounded to int).
        var haversine = Taxi.Api.Common.Geo.HaversineDistance.Meters(fromLat, fromLng, toLat, toLng);
        var expectedRoad = (int)Math.Round(haversine * 1.3);
        var routeData = ((GeoResult<MapyRouteResultData>.Success)result.Result).Value;
        routeData.DistanceMeters.Should().Be(expectedRoad);
    }

    // ── QuickPlace_NeverCallsClientOrIncrementsUsage ──────────────────────────

    /// <summary>QuickPlace cache lookups must never call IMapyClient and never record usage,
    /// even on a cache miss.</summary>
    [Fact]
    public async Task QuickPlace_NeverCallsClientOrIncrementsUsage()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, $"gsvc-qp-{fleetId:N}", ct);

        var countingClient = new CountingMapyClient();

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var geoService = BuildGeoService(scope, countingClient);

        // QuickPlace — a pure cache-only lookup, no client call on miss.
        var result = await geoService.QuickPlaceAsync(fleetId, "airport", ct);

        // No client calls.
        countingClient.QuickPlaceCalls.Should().Be(0, "QuickPlace never calls IMapyClient");

        // No usage row.
        var usage = await ReadUsageCallsAsync(fleetId, GeoCacheKind.QuickPlace, ct);
        usage.Should().BeNull("QuickPlace never records geo_usage");

        // On miss, result is Unavailable (nothing in cache) with WasHit=false.
        result.WasHit.Should().BeFalse();
        result.Result.Should().BeOfType<GeoResult<IReadOnlyList<MapySuggestResult>>.Unavailable>();
    }

    // ── Suggest_NoFleetId_BypassesCacheAndUsage ──────────────────────────────

    /// <summary>When fleetId is Guid.Empty (fleetless customer), SuggestAsync must call
    /// IMapyClient directly without writing to GeoCache or geo_usage.
    /// geo_usage has a FK to fleets; inserting Guid.Empty would throw a FK violation → 500.</summary>
    [Fact]
    public async Task Suggest_NoFleetId_BypassesCacheAndUsage()
    {
        var ct = TestContext.Current.CancellationToken;
        // Do NOT seed a fleet for Guid.Empty — there is no fleet with that id.
        var fleetId = Guid.Empty;

        var suggestData = new List<MapySuggestResult>
        {
            new MapySuggestResult("Prague, CZ", null, null, 50.08, 14.43)
        };
        var fakeClient = new FakeMapyClient
        {
            SuggestReturn = new GeoResult<IReadOnlyList<MapySuggestResult>>.Success(suggestData)
        };

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var geoService = BuildGeoService(scope, fakeClient);

        // Must not throw (FK violation would surface here).
        var result = await geoService.SuggestAsync(fleetId, "Prague", near: null, ct);

        // Must return the client data.
        result.Result.Should().BeOfType<GeoResult<IReadOnlyList<MapySuggestResult>>.Success>();
        var items = ((GeoResult<IReadOnlyList<MapySuggestResult>>.Success)result.Result).Value;
        items.Should().HaveCount(1);

        // No usage row must have been written.
        var usage = await ReadUsageCallsAsync(Guid.Empty, GeoCacheKind.Suggest, ct);
        usage.Should().BeNull("fleetless suggest must not write geo_usage");
    }

    // ── Suggest_FleetHasServerKey_ResolvesAndPassesKeyToClient ────────────────

    /// <summary>Regression: the fleet's encrypted MapyServerKey must be loaded from FleetSettings,
    /// decrypted, and passed to IMapyClient. Before the fix, MapyClient called keyResolver.Resolve(null)
    /// so a per-fleet DB key was ignored and Mapy returned 401.</summary>
    [Fact]
    public async Task Suggest_FleetHasServerKey_ResolvesAndPassesKeyToClient()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, $"gsvc-key-{fleetId:N}", ct);

        // Seed a FleetSettings row with an ENCRYPTED server key (protected via the real protector
        // the resolver will use to decrypt it).
        const string plaintextKey = "fleet-server-key-abc123";
        using (var seedScope = fixture.Factory.Services.CreateScope())
        {
            var db = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var protector = seedScope.ServiceProvider.GetRequiredService<IFleetKeyProtector>();
            db.FleetSettings.Add(new FleetSettings
            {
                FleetId = fleetId,
                MapyServerKey = protector.Protect(plaintextKey)
            });
            await db.SaveChangesAsync(ct);
        }

        var fakeClient = new FakeMapyClient
        {
            SuggestReturn = new GeoResult<IReadOnlyList<MapySuggestResult>>.Success(
                new List<MapySuggestResult> { new("Praha", null, null, 50.08, 14.43) })
        };

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var geoService = BuildGeoService(scope, fakeClient);

        // Cache miss → the factory resolves the fleet key and passes it to the client.
        var result = await geoService.SuggestAsync(fleetId, $"Praha-{fleetId:N}", near: null, ct);

        fakeClient.LastServerKey.Should().Be(plaintextKey,
            "GeoService must decrypt the fleet's MapyServerKey and pass it to IMapyClient");
        result.Result.Should().BeOfType<GeoResult<IReadOnlyList<MapySuggestResult>>.Success>();
    }

    // ── Suggest_FleetlessBypass_ForwardsNearToClient ──────────────────────────

    /// <summary>On the Guid.Empty fleetless bypass path, GeoService must forward the near hint
    /// to IMapyClient.SuggestAsync verbatim — it must not swallow or null the argument.</summary>
    [Fact]
    public async Task Suggest_FleetlessBypass_ForwardsNearToClient()
    {
        var ct = TestContext.Current.CancellationToken;

        var suggestData = new List<MapySuggestResult>
        {
            new MapySuggestResult("Prague, CZ", null, null, 50.08, 14.43)
        };
        var fakeClient = new FakeMapyClient
        {
            SuggestReturn = new GeoResult<IReadOnlyList<MapySuggestResult>>.Success(suggestData)
        };

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var geoService = BuildGeoService(scope, fakeClient);

        var near = (Lat: 50.08, Lng: 14.43);
        await geoService.SuggestAsync(Guid.Empty, "Praha", near: near, ct);

        fakeClient.LastSuggestNear.Should().Be(near,
            "GeoService must forward the near hint to IMapyClient on the fleetless bypass path");
    }

    // ── Suggest_CachedFactoryPath_ForwardsNearToClient ───────────────────────

    /// <summary>On the cached-factory path (real fleet, cache miss), GeoService must forward the
    /// near hint inside the factory closure to IMapyClient.SuggestAsync.</summary>
    [Fact]
    public async Task Suggest_CachedFactoryPath_ForwardsNearToClient()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, $"gsvc-near-{fleetId:N}", ct);

        var fakeClient = new FakeMapyClient
        {
            SuggestReturn = new GeoResult<IReadOnlyList<MapySuggestResult>>.Success(
                new List<MapySuggestResult> { new("Praha", null, null, 50.08, 14.43) })
        };

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var geoService = BuildGeoService(scope, fakeClient);

        var near = (Lat: 50.08, Lng: 14.43);
        // Unique query to guarantee a cache miss (factory will be called)
        var uniqueQuery = $"Praha-near-{fleetId:N}";
        await geoService.SuggestAsync(fleetId, uniqueQuery, near: near, ct);

        fakeClient.LastSuggestNear.Should().Be(near,
            "GeoService must forward the near hint to IMapyClient inside the cache-miss factory closure");
    }

    // ── Nested test doubles ───────────────────────────────────────────────────

    /// <summary>Controllable IMapyClient that returns pre-set results and records the last server key
    /// and last suggest near hint it received — lets tests assert key resolution and near forwarding.</summary>
    private sealed class FakeMapyClient : IMapyClient
    {
        public GeoResult<IReadOnlyList<MapySuggestResult>> SuggestReturn { get; set; } =
            new GeoResult<IReadOnlyList<MapySuggestResult>>.Unavailable(GeoUnavailableReason.Timeout);

        public GeoResult<MapyGeocodeResult> GeocodeReturn { get; set; } =
            new GeoResult<MapyGeocodeResult>.Unavailable(GeoUnavailableReason.Timeout);

        public GeoResult<MapyRgeocodeResult> ReverseReturn { get; set; } =
            new GeoResult<MapyRgeocodeResult>.Unavailable(GeoUnavailableReason.Timeout);

        public GeoResult<MapyRouteResultData> RouteResult { get; set; } =
            new GeoResult<MapyRouteResultData>.Unavailable(GeoUnavailableReason.Timeout);

        /// <summary>The server key passed to the most recent client call — lets tests assert key resolution.</summary>
        public string? LastServerKey { get; private set; }

        /// <summary>The near hint passed to the most recent SuggestAsync call — lets tests assert near forwarding.</summary>
        public (double Lat, double Lng)? LastSuggestNear { get; private set; }

        public Task<GeoResult<IReadOnlyList<MapySuggestResult>>> SuggestAsync(
            string query, (double Lat, double Lng)? near, string? serverKey, CancellationToken ct)
        {
            LastSuggestNear = near;
            LastServerKey = serverKey;
            return Task.FromResult(SuggestReturn);
        }

        public Task<GeoResult<MapyGeocodeResult>> GeocodeAsync(string query, string? serverKey, CancellationToken ct)
        {
            LastServerKey = serverKey;
            return Task.FromResult(GeocodeReturn);
        }

        public Task<GeoResult<MapyRgeocodeResult>> ReverseGeocodeAsync(double lat, double lng, string? serverKey, CancellationToken ct)
        {
            LastServerKey = serverKey;
            return Task.FromResult(ReverseReturn);
        }

        public Task<GeoResult<MapyRouteResultData>> RouteAsync(double fromLat, double fromLng, double toLat, double toLng, string? serverKey, CancellationToken ct)
        {
            LastServerKey = serverKey;
            return Task.FromResult(RouteResult);
        }
    }

    /// <summary>IMapyClient that counts calls but never returns useful data.</summary>
    private sealed class CountingMapyClient : IMapyClient
    {
        public int SuggestCalls { get; private set; }
        public int GeocodeCalls { get; private set; }
        public int ReverseCalls { get; private set; }
        public int RouteCalls { get; private set; }
        public int QuickPlaceCalls { get; private set; }

        public Task<GeoResult<IReadOnlyList<MapySuggestResult>>> SuggestAsync(
            string query, (double Lat, double Lng)? near, string? serverKey, CancellationToken ct)
        {
            SuggestCalls++;
            return Task.FromResult<GeoResult<IReadOnlyList<MapySuggestResult>>>(
                new GeoResult<IReadOnlyList<MapySuggestResult>>.Unavailable(GeoUnavailableReason.Timeout));
        }

        public Task<GeoResult<MapyGeocodeResult>> GeocodeAsync(string query, string? serverKey, CancellationToken ct)
        {
            GeocodeCalls++;
            return Task.FromResult<GeoResult<MapyGeocodeResult>>(
                new GeoResult<MapyGeocodeResult>.Unavailable(GeoUnavailableReason.Timeout));
        }

        public Task<GeoResult<MapyRgeocodeResult>> ReverseGeocodeAsync(double lat, double lng, string? serverKey, CancellationToken ct)
        {
            ReverseCalls++;
            return Task.FromResult<GeoResult<MapyRgeocodeResult>>(
                new GeoResult<MapyRgeocodeResult>.Unavailable(GeoUnavailableReason.Timeout));
        }

        public Task<GeoResult<MapyRouteResultData>> RouteAsync(double fromLat, double fromLng, double toLat, double toLng, string? serverKey, CancellationToken ct)
        {
            RouteCalls++;
            return Task.FromResult<GeoResult<MapyRouteResultData>>(
                new GeoResult<MapyRouteResultData>.Unavailable(GeoUnavailableReason.Timeout));
        }
    }
}
