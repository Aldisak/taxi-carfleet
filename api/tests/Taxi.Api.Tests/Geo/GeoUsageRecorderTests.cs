using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Integration tests for <see cref="GeoUsageRecorder"/> atomic upsert accounting.</summary>
[Collection(TestCollections.Database)]
public sealed class GeoUsageRecorderTests(PostgresFixture fixture)
{
    // ── test 5: concurrent misses accumulate correctly (no lost update) ─────────────────

    /// <summary>Two parallel usages for the same (fleet, day, kind) upsert atomically;
    /// the final calls count equals the number of increments with no lost update.</summary>
    [Fact]
    public async Task RecordAsync_TwoParallelCalls_AtomicUpsertNoLostUpdate()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, "usage-recorder-test-5", ct);

        // Run two RecordAsync calls in parallel — each in its own scope/DbContext
        // (DbContext is not thread-safe; parallelism requires separate scopes).
        async Task RecordOne()
        {
            await using var scope = fixture.Factory.Services.CreateAsyncScope();
            var recorder = scope.ServiceProvider.GetRequiredService<GeoUsageRecorder>();
            await recorder.RecordAsync(fleetId, GeoCacheKind.Geocode, ct);
        }

        await Task.WhenAll(RecordOne(), RecordOne());

        // Assert: calls = 2, credits_est = 8 (2 × 4 credits)
        await using var dbScope = fixture.Factory.Services.CreateAsyncScope();
        var db = dbScope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fakeTime = fixture.Factory.FakeTime;
        var pragueDay = DateOnly.FromDateTime(fakeTime.GetLocalNow().DateTime);

        var usage = await db.GeoUsage
            .Where(u => u.FleetId == fleetId && u.Kind == GeoCacheKind.Geocode && u.Day == pragueDay)
            .FirstOrDefaultAsync(ct);

        usage.Should().NotBeNull("atomic upsert should have created a row");
        usage!.Calls.Should().Be(2, "each of 2 parallel calls contributes 1");
        usage.CreditsEst.Should().Be(8, "each call contributes 4 credits");
    }

    /// <summary>GeoUsageRecorder must be registered with Scoped lifetime (not Singleton — would capture DbContext).</summary>
    [Fact]
    public void GeoUsageRecorder_Registration_IsScopedNotSingleton()
    {
        using var scope1 = fixture.Factory.Services.CreateScope();
        var a = scope1.ServiceProvider.GetRequiredService<GeoUsageRecorder>();
        var b = scope1.ServiceProvider.GetRequiredService<GeoUsageRecorder>();
        a.Should().BeSameAs(b, "within a scope both resolutions should return the same scoped instance");

        using var scope2 = fixture.Factory.Services.CreateScope();
        var c = scope2.ServiceProvider.GetRequiredService<GeoUsageRecorder>();
        a.Should().NotBeSameAs(c, "across scopes the instances must differ (proves Scoped, not Singleton)");
    }

    // ── helper ────────────────────────────────────────────────────────────────────────────

    private async Task SeedFleetAsync(Guid fleetId, string slug, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Name = $"GeoUsage Test Fleet {slug}",
            Slug = slug,
            Phone = "+420000000098",
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
    }
}
