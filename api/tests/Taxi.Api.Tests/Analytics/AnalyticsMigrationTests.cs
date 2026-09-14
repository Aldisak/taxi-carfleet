using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Analytics;

/// <summary>Integration tests verifying that the analytics migration applies cleanly and
/// that the weekly digest marker unique index enforces (fleet_id, iso_year, iso_week) uniqueness.</summary>
[Collection(TestCollections.Database)]
public sealed class AnalyticsMigrationTests(PostgresFixture fixture)
{
    /// <summary>Verifies that the AddAnalyticsIndexesAndDigestMarker migration applies cleanly
    /// and that the unique index on (fleet_id, iso_year, iso_week) rejects duplicate digest markers.</summary>
    [Fact]
    public async Task Migration_AnalyticsIndexesAndDigestMarker_AppliesAndEnforcesUniqueMarker()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();

        // Seed a fleet row (required by the FK on WeeklyDigestMarker).
        await using var fleetScope = fixture.Factory.Services.CreateAsyncScope();
        var ctxFleet = fleetScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        ctxFleet.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"digest-{Guid.NewGuid():N}",
            Name = "Digest Test Fleet",
            Phone = "+420777100001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await ctxFleet.SaveChangesAsync(ct);

        // Insert the first weekly digest marker — null-tenant scope (digest job writes via IgnoreQueryFilters).
        await using var scope1 = fixture.Factory.Services.CreateAsyncScope();
        var ctx1 = scope1.ServiceProvider.GetRequiredService<TaxiDbContext>();
        ctx1.WeeklyDigestMarkers.Add(new WeeklyDigestMarker
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            IsoYear = 2026,
            IsoWeek = 37,
            SentAt = DateTimeOffset.UtcNow
        });
        await ctx1.SaveChangesAsync(ct);

        // Attempt a duplicate (same fleet_id, iso_year, iso_week) — must violate unique constraint.
        await using var scope2 = fixture.Factory.Services.CreateAsyncScope();
        var ctx2 = scope2.ServiceProvider.GetRequiredService<TaxiDbContext>();
        ctx2.WeeklyDigestMarkers.Add(new WeeklyDigestMarker
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            IsoYear = 2026,
            IsoWeek = 37,
            SentAt = DateTimeOffset.UtcNow
        });
        var act = async () => await ctx2.SaveChangesAsync(ct);
        var ex = await act.Should().ThrowAsync<DbUpdateException>();
        ex.Which.InnerException.Should().BeOfType<PostgresException>()
            .Which.SqlState.Should().Be("23505");
    }
}
