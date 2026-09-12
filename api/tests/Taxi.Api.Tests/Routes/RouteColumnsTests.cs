using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;
using RouteEntity = Taxi.Api.Infrastructure.Entities.Route;

namespace Taxi.Api.Tests.Routes;

/// <summary>Tests for the A1 route columns: FromRadiusMeters/ToRadiusMeters (default 150) and
/// IsBidirectional (default true). Verifies the defaults apply both at the entity level and
/// at the database level (migration backfill via HasDefaultValue).</summary>
[Collection(TestCollections.Database)]
public sealed class RouteColumnsTests(PostgresFixture fixture)
{
    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"rcols-{slugSuffix}",
        Name = $"RCols Fleet {slugSuffix}",
        Phone = "+420605000001",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    /// <summary>A newly constructed Route entity carries the three documented defaults
    /// (150, 150, true) before any persistence.</summary>
    [Fact]
    public void RouteColumns_DefaultsApplied_NewRouteHas150And150AndTrue()
    {
        var route = new RouteEntity
        {
            Id = Guid.CreateVersion7(),
            FleetId = Guid.CreateVersion7(),
            Name = "Test",
            Type = RouteType.PointToPoint,
            PriceCzk = 100
        };

        route.FromRadiusMeters.Should().Be(150);
        route.ToRadiusMeters.Should().Be(150);
        route.IsBidirectional.Should().BeTrue();
    }

    /// <summary>Inserting a row via raw SQL (no EF columns specified for the three new columns) and
    /// reading it back through EF proves the migration applied the DB-side defaults to existing rows.</summary>
    [Fact]
    public async Task RouteColumns_Migration_BackfillsExistingRows()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var routeId = Guid.CreateVersion7();

        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);

        // Insert a routes row WITHOUT specifying the three new columns — the DB defaults must apply.
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO routes (id, fleet_id, name, type, price_czk, from_lat, from_lng, valid_days, priority, is_enabled)
            VALUES ({routeId}, {fleet.Id}, 'Backfill', 'PointToPoint', 100, 0, 0, 127, 0, true)
            """, ct);

        tenant.FleetId = fleet.Id;
        var route = await db.Routes.AsNoTracking().FirstAsync(r => r.Id == routeId, ct);

        route.FromRadiusMeters.Should().Be(150, "DB default must backfill rows inserted without the column");
        route.ToRadiusMeters.Should().Be(150);
        route.IsBidirectional.Should().BeTrue();
    }
}
