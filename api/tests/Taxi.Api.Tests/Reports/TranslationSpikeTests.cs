using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Reports;

/// <summary>Regression guards for the two risky LINQ/SQL shapes the report and audit slices depend on:
/// the Prague-local day aggregation (FromSql with <c>AT TIME ZONE</c>) and the audit <c>.Concat()</c>
/// UNION-ALL paging. Both must translate/execute against the real Postgres container.</summary>
[Collection(TestCollections.Database)]
public sealed class TranslationSpikeTests(PostgresFixture fixture)
{
    /// <summary>A FromSql Prague-day aggregation with snake_case aliases maps onto a positional record.</summary>
    [Fact]
    public async Task Spike_PragueDayGroupBy_TranslatesToSql()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var start = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var end = new DateTimeOffset(2027, 1, 1, 0, 0, 0, TimeSpan.Zero);

        // EF maps FromSql columns by the snake_case name of each record property — aliases MUST be snake_case.
        var rows = await db.Database.SqlQuery<DaySpikeRow>(
            $"""
             SELECT (created_at AT TIME ZONE 'Europe/Prague')::date AS "day",
                    COUNT(*)::int AS "count",
                    COALESCE(SUM(COALESCE(final_price_czk, 0)), 0)::int AS "sum"
             FROM orders
             WHERE fleet_id = {fleetId} AND created_at >= {start} AND created_at < {end}
             GROUP BY (created_at AT TIME ZONE 'Europe/Prague')::date
             ORDER BY 1
             """).ToListAsync(ct);

        rows.Should().NotBeNull();
    }

    /// <summary>Concat of two projected sources into one shape, ordered and paged, translates to UNION ALL.</summary>
    [Fact]
    public async Task Spike_ConcatUnionPaging_TranslatesToSql()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var events = db.OrderEvents.AsNoTracking()
            .Select(e => new { e.At, e.Id, Source = "OrderEvent" });
        var audits = db.AuditLogs.AsNoTracking()
            .Select(a => new { a.At, a.Id, Source = "AuditLog" });

        var merged = await events.Concat(audits)
            .OrderByDescending(x => x.At).ThenByDescending(x => x.Id)
            .Skip(0).Take(25)
            .ToListAsync(ct);

        merged.Should().NotBeNull();
    }

    private async Task SeedFleetAsync(Guid fleetId, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"spike-{Guid.NewGuid():N}",
            Name = "Spike Fleet",
            Phone = "+420777005001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Row shape for the FromSql Prague-day aggregation spike.</summary>
    private sealed record DaySpikeRow(DateTime Day, int Count, int Sum);
}
