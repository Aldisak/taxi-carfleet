using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Schema + migration integration tests for the UC-010 Mapy.com geo tables.</summary>
[Collection(TestCollections.Database)]
public sealed class GeoSchemaMigrationTests(PostgresFixture fixture)
{
    /// <summary>After the AddMapyGeoSchema migration applies, both geo_cache and geo_usage tables
    /// exist and can be inserted to (composite primary keys are enforced).</summary>
    [Fact]
    public async Task Migration_AddMapyGeoSchema_AppliesAndEnforcesCompositeKeys()
    {
        var ct = TestContext.Current.CancellationToken;

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Arrange: seed a fleet and fleet-settings to satisfy FK constraints.
        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Name = "GeoTest Fleet",
            Slug = $"geo-schema-{Guid.NewGuid():N}",
            Phone = "+420000000001",
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);

        // Act: insert a GeoCacheEntry
        var cacheEntry = new GeoCacheEntry
        {
            FleetId = fleet.Id,
            Kind = GeoCacheKind.Suggest,
            Key = "test-key-001",
            Value = null,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.GeoCacheEntries.Add(cacheEntry);
        await db.SaveChangesAsync(ct);

        // Act: insert a GeoUsage row
        var usage = new GeoUsage
        {
            FleetId = fleet.Id,
            Day = DateOnly.FromDateTime(DateTime.UtcNow),
            Kind = GeoCacheKind.Suggest,
            Calls = 10,
            CreditsEst = 50
        };
        db.GeoUsage.Add(usage);
        await db.SaveChangesAsync(ct);

        // Assert: both rows can be read back
        var cacheCount = await db.GeoCacheEntries
            .Where(e => e.FleetId == fleet.Id)
            .CountAsync(ct);
        cacheCount.Should().Be(1);

        var usageCount = await db.GeoUsage
            .Where(u => u.FleetId == fleet.Id)
            .CountAsync(ct);
        usageCount.Should().Be(1);
    }

    /// <summary>Inserting two GeoCacheEntry rows with the same (FleetId, Kind, Key) composite PK
    /// must throw a DbUpdateException wrapping a PostgresException with SqlState 23505.</summary>
    [Fact]
    public async Task GeoCache_DuplicateFleetKindKey_ViolatesPrimaryKey()
    {
        var ct = TestContext.Current.CancellationToken;

        // Arrange: seed a fleet.
        await using var scope1 = fixture.Factory.Services.CreateAsyncScope();
        var db1 = scope1.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Name = "GeoTest DupFleet",
            Slug = $"geo-dup-{Guid.NewGuid():N}",
            Phone = "+420000000002",
            CreatedAt = DateTimeOffset.UtcNow
        };
        db1.Fleets.Add(fleet);
        await db1.SaveChangesAsync(ct);

        // Insert first row in scope1.
        var entry1 = new GeoCacheEntry
        {
            FleetId = fleet.Id,
            Kind = GeoCacheKind.Geocode,
            Key = "dup-key-001",
            Value = null,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db1.GeoCacheEntries.Add(entry1);
        await db1.SaveChangesAsync(ct);

        // Insert duplicate in a separate scope to trigger a DB PK violation (not EF change-tracker).
        await using var scope2 = fixture.Factory.Services.CreateAsyncScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var dup = new GeoCacheEntry
        {
            FleetId = fleet.Id,
            Kind = GeoCacheKind.Geocode,
            Key = "dup-key-001",
            Value = null,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db2.GeoCacheEntries.Add(dup);

        var act = async () => await db2.SaveChangesAsync(ct);
        var ex = await act.Should().ThrowAsync<DbUpdateException>();
        ex.Which.InnerException.Should().BeOfType<PostgresException>()
            .Which.SqlState.Should().Be("23505");
    }
}
