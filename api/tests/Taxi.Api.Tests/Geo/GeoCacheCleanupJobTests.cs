using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Jobs;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Integration tests for <see cref="GeoCacheCleanupJob"/>. The job is constructed directly
/// with a locally-pinned <see cref="FakeTimeProvider"/> and the shared fixture's scope factory so
/// per-kind TTL cutoffs are controlled deterministically without a real timer.</summary>
[Collection(TestCollections.Database)]
public sealed class GeoCacheCleanupJobTests(PostgresFixture fixture)
{
    /// <summary>Pinned "now" used by the job and as the reference point for seeded CreatedAt values.</summary>
    private static readonly DateTimeOffset Now = new(2026, 9, 15, 12, 0, 0, TimeSpan.Zero);

    /// <summary>Builds a job instance with a locally pinned FakeTimeProvider (does not share the
    /// fixture's DI time, so tests are independent and deterministic).</summary>
    private GeoCacheCleanupJob BuildJob() => new(
        fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
        new FakeTimeProvider(Now),
        NullLogger<GeoCacheCleanupJob>.Instance);

    // ── test 1: Route row past 24h is deleted ─────────────────────────────────────────────

    /// <summary>A Route cache entry older than 24 h is deleted on the sweep tick.</summary>
    [Fact]
    public async Task RunTickAsync_RouteEntryPast24h_IsDeleted()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = await SeedFleetAsync("cleanup-route-expired", ct);

        // Row is 25 hours old — past the 24h Route TTL.
        await SeedGeoCacheEntryAsync(fleetId, GeoCacheKind.Route, "route-expired-key",
            Now.AddHours(-25), ct);

        await BuildJob().RunTickAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var row = await db.GeoCacheEntries
            .Where(e => e.FleetId == fleetId && e.Kind == GeoCacheKind.Route && e.Key == "route-expired-key")
            .FirstOrDefaultAsync(ct);
        row.Should().BeNull("a Route row older than 24 h must be swept");
    }

    // ── test 2: fresh Route row within 24h survives ────────────────────────────────────────

    /// <summary>A Route cache entry younger than 24 h is NOT deleted on the sweep tick.</summary>
    [Fact]
    public async Task RunTickAsync_RouteEntryWithin24h_Survives()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = await SeedFleetAsync("cleanup-route-fresh", ct);

        // Row is 23 hours old — within the 24h Route TTL.
        await SeedGeoCacheEntryAsync(fleetId, GeoCacheKind.Route, "route-fresh-key",
            Now.AddHours(-23), ct);

        await BuildJob().RunTickAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var row = await db.GeoCacheEntries
            .Where(e => e.FleetId == fleetId && e.Kind == GeoCacheKind.Route && e.Key == "route-fresh-key")
            .FirstOrDefaultAsync(ct);
        row.Should().NotBeNull("a Route row younger than 24 h must survive");
    }

    // ── test 3: Suggest row at 6d survives, at 8d is deleted ──────────────────────────────

    /// <summary>A Suggest cache entry at 6 days (within the 7-day TTL) survives the sweep.</summary>
    [Fact]
    public async Task RunTickAsync_SuggestEntry6Days_Survives()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = await SeedFleetAsync("cleanup-suggest-6d", ct);

        await SeedGeoCacheEntryAsync(fleetId, GeoCacheKind.Suggest, "suggest-6d-key",
            Now.AddDays(-6), ct);

        await BuildJob().RunTickAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var row = await db.GeoCacheEntries
            .Where(e => e.FleetId == fleetId && e.Kind == GeoCacheKind.Suggest && e.Key == "suggest-6d-key")
            .FirstOrDefaultAsync(ct);
        row.Should().NotBeNull("a Suggest row at 6 d is within the 7-day TTL and must survive");
    }

    /// <summary>A Suggest cache entry at 8 days (past the 7-day TTL) is deleted on the sweep.</summary>
    [Fact]
    public async Task RunTickAsync_SuggestEntry8Days_IsDeleted()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = await SeedFleetAsync("cleanup-suggest-8d", ct);

        await SeedGeoCacheEntryAsync(fleetId, GeoCacheKind.Suggest, "suggest-8d-key",
            Now.AddDays(-8), ct);

        await BuildJob().RunTickAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var row = await db.GeoCacheEntries
            .Where(e => e.FleetId == fleetId && e.Kind == GeoCacheKind.Suggest && e.Key == "suggest-8d-key")
            .FirstOrDefaultAsync(ct);
        row.Should().BeNull("a Suggest row at 8 d is past the 7-day TTL and must be swept");
    }

    // ── test 4: QuickPlace row past 30 days survives (never swept) ────────────────────────

    /// <summary>A QuickPlace cache entry past 30 days is NEVER deleted by the cleanup sweep
    /// (QuickPlace has infinite TTL; it is invalidated only on Place edits).</summary>
    [Fact]
    public async Task RunTickAsync_QuickPlaceEntryPast30Days_NeverDeleted()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = await SeedFleetAsync("cleanup-quickplace-old", ct);

        // A very old QuickPlace entry — past what would be any finite TTL.
        await SeedGeoCacheEntryAsync(fleetId, GeoCacheKind.QuickPlace, "quickplace-old-key",
            Now.AddDays(-60), ct);

        await BuildJob().RunTickAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var row = await db.GeoCacheEntries
            .Where(e => e.FleetId == fleetId && e.Kind == GeoCacheKind.QuickPlace && e.Key == "quickplace-old-key")
            .FirstOrDefaultAsync(ct);
        row.Should().NotBeNull("QuickPlace entries have infinite TTL and must NEVER be swept");
    }

    // ── helpers ───────────────────────────────────────────────────────────────────────────

    /// <summary>Seeds a fleet row and returns its ID.</summary>
    private async Task<Guid> SeedFleetAsync(string slug, CancellationToken ct)
    {
        var fleetId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Name = $"Cleanup Test Fleet {slug}",
            Slug = slug,
            Phone = "+420000000088",
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return fleetId;
    }

    /// <summary>Seeds a geo_cache row with the given CreatedAt timestamp.</summary>
    private async Task SeedGeoCacheEntryAsync(
        Guid fleetId,
        GeoCacheKind kind,
        string key,
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
            Value = JsonDocument.Parse("{\"cached\":true}"),
            CreatedAt = createdAt
        });
        await db.SaveChangesAsync(ct);
    }
}
