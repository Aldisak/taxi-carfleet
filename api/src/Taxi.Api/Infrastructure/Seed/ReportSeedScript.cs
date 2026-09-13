using Microsoft.EntityFrameworkCore;

namespace Taxi.Api.Infrastructure.Seed;

/// <summary>Inserts a large, fleet-scoped batch of completed orders for performance testing of the
/// fleet report (UC-007 AC#2: &lt;300 ms @ 50k). This is NOT the demo seeder — it is a dev/test-only,
/// idempotent bulk inserter keyed on a per-fleet marker (it skips if the fleet already has orders).
/// <para>Uses a single raw <c>INSERT … SELECT FROM generate_series</c> so 50 000 rows land in one
/// round-trip — row-by-row EF AddRange would be too slow and would distort the perf measurement.</para></summary>
internal sealed class ReportSeedScript(IServiceScopeFactory scopeFactory)
{
    /// <summary>Bulk-inserts <paramref name="count"/> completed orders for <paramref name="fleetId"/> with
    /// varied source, payment type, route, rating, and timestamps spread over the past ~180 days.
    /// Idempotent: does nothing if the fleet already has any orders.</summary>
    /// <param name="fleetId">The fleet to seed orders into. Must already exist.</param>
    /// <param name="count">Number of orders to insert.</param>
    /// <param name="ct">Cancellation token.</param>
    public async Task SeedOrdersAsync(Guid fleetId, int count, CancellationToken ct = default)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var existing = await db.Orders.IgnoreQueryFilters()
            .Where(o => o.FleetId == fleetId)
            .AnyAsync(ct);
        if (existing) return;

        // One set-based insert. created_at is spread across the last 180 days; payment/source/route
        // vary by modulo so the KPI aggregations have realistic distribution. uuidv7() is generated
        // app-side normally, but for bulk seeding gen_random_uuid() is sufficient (ids are not ordered-read here).
        var sql = """
            INSERT INTO orders (
                id, fleet_id, public_code, status, source, customer_phone, pickup_address,
                pickup_lat, pickup_lng, passengers, price_type, route_id, final_price_czk,
                payment_type, price_override_reason, rating_stars, driver_id, created_at,
                assigned_at, accepted_at, arrived_at, started_at, completed_at, updated_at, version)
            SELECT
                gen_random_uuid(),
                @fleetId,
                'P' || lpad(gs::text, 5, '0'),
                'Completed',
                (ARRAY['Phone','App','Dispatcher'])[1 + (gs % 3)],
                '+420777' || lpad((gs % 1000000)::text, 6, '0'),
                'Pickup ' || gs,
                50.0 + (gs % 100) * 0.001,
                15.2 + (gs % 100) * 0.001,
                1,
                (ARRAY['Estimate','Fixed','Meter'])[1 + (gs % 3)],
                NULL,
                100 + (gs % 400),
                (ARRAY['Cash','Card','Invoice'])[1 + (gs % 3)],
                CASE WHEN gs % 10 = 0 THEN 'Bulk seed override' ELSE NULL END,
                CASE WHEN gs % 5 = 0 THEN 1 + (gs % 5) ELSE NULL END,
                NULL,
                base_ts,
                base_ts + interval '2 minutes',
                base_ts + interval '4 minutes',
                base_ts + interval '9 minutes',
                base_ts + interval '10 minutes',
                base_ts + interval '25 minutes',
                base_ts + interval '25 minutes',
                1
            FROM generate_series(1, @count) AS gs
            CROSS JOIN LATERAL (
                SELECT (now() AT TIME ZONE 'UTC') - ((gs % 180) || ' days')::interval AS base_ts
            ) t;
            """;

        await db.Database.ExecuteSqlRawAsync(
            sql,
            [
                new Npgsql.NpgsqlParameter("fleetId", fleetId),
                new Npgsql.NpgsqlParameter("count", count)
            ],
            ct);
    }
}
