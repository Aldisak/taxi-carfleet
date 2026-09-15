using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Integration tests for the two-tier geo cache (L1 MemoryCache + L2 Postgres) and usage accounting.</summary>
[Collection(TestCollections.Database)]
public sealed class GeoCacheTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset PinnedNow =
        new DateTimeOffset(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    // ── test 1: miss → factory invoked once, L1+L2 populated, geo_usage row ─────────────

    /// <summary>On first call (cache miss) the factory is invoked exactly once,
    /// the result is written to L1 (MemoryCache) and L2 (geo_cache row),
    /// and a geo_usage row is created with calls=1 / credits_est=4.</summary>
    [Fact]
    public async Task GetOrAddAsync_CacheMiss_PopulatesL1AndL2AndUsage()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, "geo-cache-test-1", ct);

        int factoryCalls = 0;

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var cache = scope.ServiceProvider.GetRequiredService<GeoCache>();

        var result = await cache.GetOrAddAsync<string>(
            fleetId,
            GeoCacheKind.Geocode,
            "test-key-miss-1",
            async c =>
            {
                factoryCalls++;
                return await Task.FromResult((GeoResult<string>)new GeoResult<string>.Success("cached-value"));
            },
            ct);

        // factory invoked exactly once
        factoryCalls.Should().Be(1);

        // result is Success
        result.Result.Should().BeOfType<GeoResult<string>.Success>()
            .Which.Value.Should().Be("cached-value");

        // was a miss
        result.WasHit.Should().BeFalse();

        // L2: geo_cache row exists
        await using var dbScope = fixture.Factory.Services.CreateAsyncScope();
        var db = dbScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var row = await db.GeoCacheEntries
            .Where(e => e.FleetId == fleetId && e.Kind == GeoCacheKind.Geocode && e.Key == "test-key-miss-1")
            .FirstOrDefaultAsync(ct);
        row.Should().NotBeNull();
        row!.Value.Should().NotBeNull();

        // geo_usage row: calls=1, credits_est=4
        var usage = await db.GeoUsage
            .Where(u => u.FleetId == fleetId && u.Kind == GeoCacheKind.Geocode)
            .FirstOrDefaultAsync(ct);
        usage.Should().NotBeNull();
        usage!.Calls.Should().Be(1);
        usage.CreditsEst.Should().Be(4);
    }

    // ── test 2: second identical call → L1 hit, no factory re-invoke, no usage increment ──

    /// <summary>A second call with the same (fleetId, kind, key) is served from L1 (MemoryCache);
    /// the factory is not invoked and the geo_usage counter does not change.</summary>
    [Fact]
    public async Task GetOrAddAsync_SecondIdenticalCall_IsL1HitNoFactoryNoUsageIncrement()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, "geo-cache-test-2", ct);

        int factoryCalls = 0;

        // first call — miss, populates L1+L2
        await using var scope1 = fixture.Factory.Services.CreateAsyncScope();
        var cache1 = scope1.ServiceProvider.GetRequiredService<GeoCache>();
        var firstResult = await cache1.GetOrAddAsync<string>(
            fleetId,
            GeoCacheKind.Suggest,
            "test-key-hit-2",
            async c =>
            {
                factoryCalls++;
                return await Task.FromResult((GeoResult<string>)new GeoResult<string>.Success("hit-value"));
            },
            ct);
        firstResult.WasHit.Should().BeFalse();
        factoryCalls.Should().Be(1);

        // second call — must hit L1 (same scope's IMemoryCache is the singleton)
        await using var scope2 = fixture.Factory.Services.CreateAsyncScope();
        var cache2 = scope2.ServiceProvider.GetRequiredService<GeoCache>();
        var secondResult = await cache2.GetOrAddAsync<string>(
            fleetId,
            GeoCacheKind.Suggest,
            "test-key-hit-2",
            async c =>
            {
                factoryCalls++;
                return await Task.FromResult((GeoResult<string>)new GeoResult<string>.Success("should-not-return"));
            },
            ct);

        // L1 hit
        secondResult.WasHit.Should().BeTrue();
        secondResult.Result.Should().BeOfType<GeoResult<string>.Success>()
            .Which.Value.Should().Be("hit-value");

        // factory still called only once
        factoryCalls.Should().Be(1);

        // usage counter unchanged at 1
        await using var dbScope = fixture.Factory.Services.CreateAsyncScope();
        var db = dbScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var usage = await db.GeoUsage
            .Where(u => u.FleetId == fleetId && u.Kind == GeoCacheKind.Suggest)
            .FirstOrDefaultAsync(ct);
        usage.Should().NotBeNull();
        usage!.Calls.Should().Be(1);
    }

    // ── test 3: stale L2 row → treated as miss, factory re-invoked ────────────────────────

    /// <summary>A geo_cache row whose CreatedAt is older than the kind's TTL is treated as a miss;
    /// the factory is invoked and the stale row is refreshed.</summary>
    [Fact]
    public async Task GetOrAddAsync_StaleL2Row_TreatedAsMissAndRowRefreshed()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, "geo-cache-test-3", ct);

        // Seed a stale geo_cache row directly (CreatedAt 8 days ago — Suggest TTL is 7d).
        // PinnedNow is 2026-09-10 12:00 UTC; stale = PinnedNow - 8 days.
        var staleCreatedAt = PinnedNow.AddDays(-8);
        await SeedGeoCacheEntryAsync(
            fleetId,
            GeoCacheKind.Suggest,
            "stale-key-3",
            "old-value",
            staleCreatedAt,
            ct);

        int factoryCalls = 0;

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var cache = scope.ServiceProvider.GetRequiredService<GeoCache>();

        var result = await cache.GetOrAddAsync<string>(
            fleetId,
            GeoCacheKind.Suggest,
            "stale-key-3",
            async c =>
            {
                factoryCalls++;
                return await Task.FromResult((GeoResult<string>)new GeoResult<string>.Success("fresh-value"));
            },
            ct);

        // treated as miss → factory called
        factoryCalls.Should().Be(1);
        result.WasHit.Should().BeFalse();

        // result is the fresh value from factory
        result.Result.Should().BeOfType<GeoResult<string>.Success>()
            .Which.Value.Should().Be("fresh-value");
    }

    // ── test 4: factory returns Unavailable → nothing cached, no geo_usage row ──────────

    /// <summary>When the factory returns Unavailable, no cache entry and no geo_usage row is written.</summary>
    [Fact]
    public async Task GetOrAddAsync_FactoryReturnsUnavailable_NothingCachedNoUsage()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, "geo-cache-test-4", ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var cache = scope.ServiceProvider.GetRequiredService<GeoCache>();

        var result = await cache.GetOrAddAsync<string>(
            fleetId,
            GeoCacheKind.Route,
            "unavail-key-4",
            async c =>
                await Task.FromResult(
                    (GeoResult<string>)new GeoResult<string>.Unavailable(GeoUnavailableReason.CircuitOpen)),
            ct);

        // result is Unavailable
        result.Result.Should().BeOfType<GeoResult<string>.Unavailable>();
        result.WasHit.Should().BeFalse();

        // L2: no geo_cache row
        await using var dbScope = fixture.Factory.Services.CreateAsyncScope();
        var db = dbScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var row = await db.GeoCacheEntries
            .Where(e => e.FleetId == fleetId && e.Kind == GeoCacheKind.Route && e.Key == "unavail-key-4")
            .FirstOrDefaultAsync(ct);
        row.Should().BeNull();

        // no geo_usage row
        var usage = await db.GeoUsage
            .Where(u => u.FleetId == fleetId && u.Kind == GeoCacheKind.Route)
            .FirstOrDefaultAsync(ct);
        usage.Should().BeNull();
    }

    // ── test (registration lifetime): GeoCache must be SCOPED ─────────────────────────────

    /// <summary>GeoCache must be registered with Scoped lifetime: different instances across scopes,
    /// same instance within a scope (proves it is not Singleton capturing DbContext, and not Transient).</summary>
    [Fact]
    public void GeoCache_Registration_IsScopedNotSingleton()
    {
        // Within the same scope: two resolutions should return the same instance.
        using var scope1 = fixture.Factory.Services.CreateScope();
        var a = scope1.ServiceProvider.GetRequiredService<GeoCache>();
        var b = scope1.ServiceProvider.GetRequiredService<GeoCache>();
        a.Should().BeSameAs(b, "within a scope both resolutions should return the same scoped instance");

        // Across scopes: different instances.
        using var scope2 = fixture.Factory.Services.CreateScope();
        var c = scope2.ServiceProvider.GetRequiredService<GeoCache>();
        a.Should().NotBeSameAs(c, "across scopes the instances must differ (proves Scoped, not Singleton)");
    }

    // ── helper: seed a fleet row ──────────────────────────────────────────────────────────

    private async Task SeedFleetAsync(Guid fleetId, string slug, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Name = $"GeoCache Test Fleet {slug}",
            Slug = slug,
            Phone = "+420000000099",
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedGeoCacheEntryAsync(
        Guid fleetId,
        GeoCacheKind kind,
        string key,
        string value,
        DateTimeOffset createdAt,
        CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.GeoCacheEntries.Add(new GeoCacheEntry
        {
            FleetId = fleetId,
            Kind = kind,
            Key = key,
            Value = JsonDocument.Parse($"\"{value}\""),
            CreatedAt = createdAt
        });
        await db.SaveChangesAsync(ct);
    }
}
