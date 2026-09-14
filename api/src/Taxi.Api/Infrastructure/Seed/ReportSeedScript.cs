using Microsoft.EntityFrameworkCore;

namespace Taxi.Api.Infrastructure.Seed;

/// <summary>Inserts a large, fleet-scoped batch of orders with realistic analytics shapes for performance
/// testing of the fleet report (UC-007 AC#2: &lt;300 ms @ 50k) and the admin analytics endpoints (UC-009).
/// This is NOT the demo seeder — it is a dev/test-only, idempotent bulk inserter keyed on a per-fleet
/// marker (it skips if the fleet already has orders).
/// <para>Uses set-based <c>INSERT … SELECT FROM generate_series</c> so tens-of-thousands of rows land in
/// a small number of round-trips — row-by-row EF AddRange would be too slow and would distort perf
/// measurements.</para>
/// <para>Status distribution per cycle of 20 serial numbers (gs % 20):
/// <list type="bullet">
///   <item>0–11 (60%): Completed with driver + full lifecycle timestamps</item>
///   <item>12–14 (15%): Cancelled while New (no driver, no AssignedAt)</item>
///   <item>15–16 (10%): Cancelled while Assigned (driver offered, no accept)</item>
///   <item>17 (5%): No-show — cancelled after Arrived (driver present, customer no-show)</item>
///   <item>18–19 (10%): Offer-funnel path — ends Completed, events include Declined+Timeout</item>
/// </list>
/// </para>
/// <para>Also seeds: driver_shifts rows (5 drivers × ~60 shifts over 180 days), order_events for every
/// relevant transition, rating comments on ~30% of completed orders, a mix of returning/one-time/anonymized
/// customers, and timestamp hour-of-day jitter for realistic heatmap distributions.</para></summary>
internal sealed class ReportSeedScript(IServiceScopeFactory scopeFactory)
{
    /// <summary>Number of synthetic driver user+profile rows created per fleet.</summary>
    private const int DriverCount = 5;

    /// <summary>Number of synthetic returning-customer user rows created per fleet.</summary>
    private const int CustomerCount = 10;

    /// <summary>Bulk-inserts <paramref name="count"/> orders for <paramref name="fleetId"/> with
    /// varied statuses, sources, payment types, ratings, driver assignments, and timestamps spread
    /// over the past ~180 days. Also inserts driver_shifts and order_events for the full analytics shape.
    /// Idempotent: does nothing if the fleet already has any orders.</summary>
    /// <param name="fleetId">The fleet to seed orders into. Must already exist.</param>
    /// <param name="count">Total number of orders to insert.</param>
    /// <param name="ct">Cancellation token.</param>
    public async Task SeedOrdersAsync(Guid fleetId, int count, CancellationToken ct = default)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var existing = await db.Orders.IgnoreQueryFilters()
            .Where(o => o.FleetId == fleetId)
            .AnyAsync(ct);
        if (existing) return;

        // ── 1. Seed supporting rows ────────────────────────────────────────────────────────────
        //
        // FK graph that must be satisfied before orders/events/shifts:
        //   orders.driver_id      → drivers.id   (Driver entity)
        //   orders.vehicle_id     → vehicles.id
        //   orders.customer_user_id → users.id
        //   order_events.actor_user_id → users.id (nullable — NULL for System/Timeout events)
        //   driver_shifts.driver_id → drivers.id
        //   driver_shifts.vehicle_id → vehicles.id
        //   drivers.user_id → users.id (1:1 unique)

        var driverUserIds = new Guid[DriverCount];
        var driverIds = new Guid[DriverCount];
        var vehicleIds = new Guid[DriverCount];
        var customerUserIds = new Guid[CustomerCount];
        var dispatcherUserId = Guid.CreateVersion7();

        // Dispatcher user (actor for Assigned events).
        await db.Database.ExecuteSqlRawAsync(
            """
            INSERT INTO users (id, fleet_id, role, email, password_hash, phone, display_name, is_active, created_at)
            VALUES (@id, @fleetId, 'Dispatcher', @email, '$2a$10$fakehashperf', @phone, 'Perf Dispatcher', true, now())
            ON CONFLICT DO NOTHING
            """,
            [
                new Npgsql.NpgsqlParameter("id", dispatcherUserId),
                new Npgsql.NpgsqlParameter("fleetId", fleetId),
                new Npgsql.NpgsqlParameter("email", $"perf-dispatcher-{fleetId:N}@perf.local"),
                new Npgsql.NpgsqlParameter("phone", $"+420800{Math.Abs(fleetId.GetHashCode()) % 1000000:000000}")
            ],
            ct);

        for (var i = 0; i < DriverCount; i++)
        {
            driverUserIds[i] = Guid.CreateVersion7();
            driverIds[i] = Guid.CreateVersion7();
            vehicleIds[i] = Guid.CreateVersion7();

            // Driver user row (unique email + phone per fleet via fleetId hash).
            await db.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO users (id, fleet_id, role, email, password_hash, phone, display_name, is_active, created_at)
                VALUES (@id, @fleetId, 'Driver', @email, '$2a$10$fakehashperf', @phone, @name, true, now())
                ON CONFLICT DO NOTHING
                """,
                [
                    new Npgsql.NpgsqlParameter("id", driverUserIds[i]),
                    new Npgsql.NpgsqlParameter("fleetId", fleetId),
                    new Npgsql.NpgsqlParameter("email", $"perf-driver{i}-{fleetId:N}@perf.local"),
                    new Npgsql.NpgsqlParameter("phone", $"+421{(i + 1) * 111111:000000000}"),
                    new Npgsql.NpgsqlParameter("name", $"Perf Driver {i + 1}")
                ],
                ct);

            // Driver profile row.
            await db.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO drivers (id, fleet_id, user_id, status, is_active)
                VALUES (@id, @fleetId, @userId, 'Offline', true)
                ON CONFLICT DO NOTHING
                """,
                [
                    new Npgsql.NpgsqlParameter("id", driverIds[i]),
                    new Npgsql.NpgsqlParameter("fleetId", fleetId),
                    new Npgsql.NpgsqlParameter("userId", driverUserIds[i])
                ],
                ct);

            // Vehicle row (needed for driver_shifts.vehicle_id FK and orders.vehicle_id).
            await db.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO vehicles (id, fleet_id, plate, make, model, color, seats, is_active)
                VALUES (@id, @fleetId, @plate, 'Skoda', 'Octavia', 'Black', 4, true)
                ON CONFLICT DO NOTHING
                """,
                [
                    new Npgsql.NpgsqlParameter("id", vehicleIds[i]),
                    new Npgsql.NpgsqlParameter("fleetId", fleetId),
                    new Npgsql.NpgsqlParameter("plate", $"P{i + 1}{Math.Abs(fleetId.GetHashCode()) % 10000:0000}")
                ],
                ct);
        }

        // Customer user rows (Customer role; no fleet_id; unique phone per user).
        for (var i = 0; i < CustomerCount; i++)
        {
            customerUserIds[i] = Guid.CreateVersion7();
            await db.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO users (id, fleet_id, role, phone, display_name, is_active, created_at)
                VALUES (@id, NULL, 'Customer', @phone, @name, true, now())
                ON CONFLICT DO NOTHING
                """,
                [
                    new Npgsql.NpgsqlParameter("id", customerUserIds[i]),
                    new Npgsql.NpgsqlParameter("phone", $"+420600{(i + 1) * 100000 + Math.Abs(fleetId.GetHashCode()) % 10000:000000}"),
                    new Npgsql.NpgsqlParameter("name", $"Perf Customer {i + 1}")
                ],
                ct);
        }

        // ── 2. Driver shifts ───────────────────────────────────────────────────────────────────
        //
        // Each driver gets ~60 shifts over the 180-day window (one per 3-day slot) using set-based SQL.
        // Shifts start between 05:00–08:00 UTC (Prague 07:00–10:00) and run 10 hours, covering the
        // order time windows fully. Hour jitter prevents all shifts aligning to the same bucket.

        var shiftDriverValues = string.Join(",\n", driverIds.Select((id, i) =>
            $"('{id}'::uuid, '{vehicleIds[i]}'::uuid, {i})"));

        // EF1002: VALUES clause inlines server-generated GUIDs — not user input, safe to suppress.
#pragma warning disable EF1002
        await db.Database.ExecuteSqlRawAsync(
            $"""
            INSERT INTO driver_shifts (id, fleet_id, driver_id, vehicle_id, started_at, ended_at)
            SELECT
                gen_random_uuid(),
                @fleetId,
                dv.driver_id,
                dv.vehicle_id,
                (now() AT TIME ZONE 'UTC')
                    - ((day_slot * 3 + dv.idx) || ' days')::interval
                    + ((5 + (dv.idx * 7 + day_slot * 13) % 3) || ' hours')::interval,
                (now() AT TIME ZONE 'UTC')
                    - ((day_slot * 3 + dv.idx) || ' days')::interval
                    + ((15 + (dv.idx * 7 + day_slot * 13) % 3) || ' hours')::interval
            FROM generate_series(0, 59) AS day_slot
            CROSS JOIN (
                VALUES {shiftDriverValues}
            ) AS dv(driver_id, vehicle_id, idx)
            WHERE day_slot * 3 + dv.idx <= 180;
            """,
            [new Npgsql.NpgsqlParameter("fleetId", fleetId)],
            ct);
#pragma warning restore EF1002

        // ── 3. Orders ─────────────────────────────────────────────────────────────────────────
        //
        // All 20-bucket status logic inlined. Driver/vehicle/customer pools are CTEs built from
        // the GUIDs allocated above so the FK references are guaranteed valid.
        //
        // Customer phone for returning customers uses the customer_user_id formatted as a phone —
        // since customer_user_id is set, the actual phone is on the user row (lookup); here we just
        // need a non-null, non-duplicate phone string that satisfies the column NOT NULL constraint.

        var driverValues = string.Join(",\n",
            driverIds.Select((id, i) => $"({i}, '{id}'::uuid)"));
        var vehicleValues = string.Join(",\n",
            vehicleIds.Select((id, i) => $"({i}, '{id}'::uuid)"));
        var customerValues = string.Join(",\n",
            customerUserIds.Select((id, i) => $"({i}, '{id}'::uuid)"));

        // EF1002: VALUES clauses inline server-generated GUIDs — not user input, safe to suppress.
#pragma warning disable EF1002
        await db.Database.ExecuteSqlRawAsync(
            $"""
            WITH driver_pool(idx, driver_id) AS (
                VALUES {driverValues}
            ),
            vehicle_pool(idx, vehicle_id) AS (
                VALUES {vehicleValues}
            ),
            customer_pool(idx, customer_user_id) AS (
                VALUES {customerValues}
            )
            INSERT INTO orders (
                id, fleet_id, public_code, status, source, customer_phone, customer_user_id,
                pickup_address, pickup_lat, pickup_lng, passengers, price_type, route_id,
                final_price_czk, payment_type, price_override_reason,
                rating_stars, rating_comment, rated_at,
                driver_id, vehicle_id,
                created_at, assigned_at, accepted_at, arrived_at, started_at, completed_at,
                cancelled_at, cancelled_by_role, cancel_reason,
                updated_at, version)
            SELECT
                gen_random_uuid(),
                @fleetId,
                'P' || lpad(gs::text, 5, '0'),
                -- ── status ──────────────────────────────────────────────────────────────────
                CASE
                    WHEN gs % 20 BETWEEN 0 AND 11 THEN 'Completed'    -- 60% completed
                    WHEN gs % 20 BETWEEN 12 AND 14 THEN 'Cancelled'   -- 15% cancelled-New
                    WHEN gs % 20 BETWEEN 15 AND 16 THEN 'Cancelled'   -- 10% cancelled-Assigned
                    WHEN gs % 20 = 17              THEN 'Cancelled'   -- 5% no-show
                    ELSE                                'Completed'   -- 10% funnel, ends Completed
                END,
                -- ── source ──────────────────────────────────────────────────────────────────
                (ARRAY['Phone','App','Dispatcher'])[1 + (gs % 3)],
                -- ── customer_phone ──────────────────────────────────────────────────────────
                -- anonymized (gs%10=0), returning (gs%10 in 1..3, phone derived from pool index),
                -- or one-timer (gs%10 in 4..9).
                CASE
                    WHEN gs % 10 = 0 THEN '+420000000000'
                    WHEN gs % 10 BETWEEN 1 AND 3
                        THEN '+420601' || lpad((gs % @customerPoolSize * 10000 + 1)::text, 6, '0')
                    ELSE '+420777' || lpad((gs % 1000000)::text, 6, '0')
                END,
                -- ── customer_user_id (returning customers only) ──────────────────────────────
                CASE
                    WHEN gs % 10 BETWEEN 1 AND 3
                    THEN (SELECT cu.customer_user_id FROM customer_pool cu WHERE cu.idx = gs % @customerPoolSize)
                    ELSE NULL
                END,
                'Pickup ' || gs,
                50.0 + (gs % 100) * 0.001,
                15.2 + (gs % 100) * 0.001,
                1 + (gs % 4),
                -- ── price_type ──────────────────────────────────────────────────────────────
                (ARRAY['Estimate','Fixed','Meter'])[1 + (gs % 3)],
                NULL,   -- route_id (NULL — route optional)
                -- ── final_price_czk (NULL when never completed) ─────────────────────────────
                CASE
                    WHEN gs % 20 BETWEEN 0 AND 11 OR gs % 20 >= 18 THEN 100 + (gs % 400)
                    ELSE NULL
                END,
                -- ── payment_type ────────────────────────────────────────────────────────────
                (ARRAY['Cash','Card','Invoice'])[1 + (gs % 3)],
                CASE WHEN gs % 15 = 0 THEN 'Bulk seed override' ELSE NULL END,
                -- ── rating_stars (~30% of completed) ────────────────────────────────────────
                CASE
                    WHEN (gs % 20 BETWEEN 0 AND 11 OR gs % 20 >= 18) AND gs % 10 < 3
                    THEN 1 + (gs % 5)
                    ELSE NULL
                END,
                -- ── rating_comment (~50% of rated get a comment) ────────────────────────────
                CASE
                    WHEN (gs % 20 BETWEEN 0 AND 11 OR gs % 20 >= 18) AND gs % 10 < 3 AND gs % 2 = 0
                    THEN 'Seed comment ' || gs
                    ELSE NULL
                END,
                -- ── rated_at ────────────────────────────────────────────────────────────────
                CASE
                    WHEN (gs % 20 BETWEEN 0 AND 11 OR gs % 20 >= 18) AND gs % 10 < 3
                    THEN base_ts + interval '30 minutes'
                    ELSE NULL
                END,
                -- ── driver_id (NULL only for Cancelled-while-New bucket 12–14) ────────────
                CASE
                    WHEN gs % 20 BETWEEN 12 AND 14 THEN NULL
                    ELSE (SELECT dp.driver_id FROM driver_pool dp WHERE dp.idx = gs % @driverPoolSize)
                END,
                -- ── vehicle_id (NULL only for Cancelled-while-New) ──────────────────────────
                CASE
                    WHEN gs % 20 BETWEEN 12 AND 14 THEN NULL
                    ELSE (SELECT vp.vehicle_id FROM vehicle_pool vp WHERE vp.idx = gs % @vehiclePoolSize)
                END,
                -- ── timestamps (hour + minute jitter for heatmap spread) ──────────────────
                base_ts,
                CASE
                    WHEN gs % 20 BETWEEN 12 AND 14 THEN NULL
                    ELSE base_ts + interval '2 minutes'
                END,
                -- accepted_at (Completed + no-show + funnel paths)
                CASE
                    WHEN gs % 20 BETWEEN 0 AND 11 OR gs % 20 = 17 OR gs % 20 >= 18
                    THEN base_ts + interval '4 minutes'
                    ELSE NULL
                END,
                -- arrived_at
                CASE
                    WHEN gs % 20 BETWEEN 0 AND 11 OR gs % 20 = 17 OR gs % 20 >= 18
                    THEN base_ts + interval '9 minutes'
                    ELSE NULL
                END,
                -- started_at (Completed paths only)
                CASE
                    WHEN gs % 20 BETWEEN 0 AND 11 OR gs % 20 >= 18
                    THEN base_ts + interval '10 minutes'
                    ELSE NULL
                END,
                -- completed_at
                CASE
                    WHEN gs % 20 BETWEEN 0 AND 11 OR gs % 20 >= 18
                    THEN base_ts + interval '25 minutes'
                    ELSE NULL
                END,
                -- cancelled_at
                CASE
                    WHEN gs % 20 BETWEEN 12 AND 14 THEN base_ts + interval '1 minute'
                    WHEN gs % 20 BETWEEN 15 AND 16 THEN base_ts + interval '3 minutes'
                    WHEN gs % 20 = 17              THEN base_ts + interval '12 minutes'
                    ELSE NULL
                END,
                -- cancelled_by_role
                CASE
                    WHEN gs % 20 BETWEEN 12 AND 14 THEN 'Customer'
                    WHEN gs % 20 BETWEEN 15 AND 16 THEN 'Dispatcher'
                    WHEN gs % 20 = 17              THEN 'Driver'
                    ELSE NULL
                END,
                -- cancel_reason
                CASE
                    WHEN gs % 20 BETWEEN 12 AND 17
                    THEN 'Seed cancel ' || (gs % 5)
                    ELSE NULL
                END,
                base_ts + interval '25 minutes',
                1
            FROM generate_series(1, @count) AS gs
            CROSS JOIN LATERAL (
                SELECT
                    (now() AT TIME ZONE 'UTC')
                        - ((gs % 180) || ' days')::interval
                        + ((gs * 7 % 24) || ' hours')::interval
                        + ((gs * 13 % 60) || ' minutes')::interval
                    AS base_ts
            ) t;
            """,
            [
                new Npgsql.NpgsqlParameter("fleetId", fleetId),
                new Npgsql.NpgsqlParameter("count", count),
                new Npgsql.NpgsqlParameter("driverPoolSize", DriverCount),
                new Npgsql.NpgsqlParameter("vehiclePoolSize", DriverCount),
                new Npgsql.NpgsqlParameter("customerPoolSize", CustomerCount)
            ],
            ct);
#pragma warning restore EF1002

        // ── 4. Order events ────────────────────────────────────────────────────────────────────
        //
        // Inserted with a UNION-ALL of all event types keyed off the just-inserted orders.
        // actor_user_id rules:
        //   Assigned   → dispatcher user (real user row, Dispatcher role)
        //   Accepted/Completed/Declined → driver user (real row, Driver role)
        //   Timeout    → NULL (System actor — no FK needed, column is nullable)
        //   Cancelled  → NULL for Customer cancellations; dispatcher ID for Dispatcher

        var driverUserValues = string.Join(",\n",
            driverIds.Select((id, i) => $"('{id}'::uuid, '{driverUserIds[i]}'::uuid)"));

        // EF1002: VALUES clause inlines server-generated GUIDs — not user input, safe to suppress.
#pragma warning disable EF1002
        await db.Database.ExecuteSqlRawAsync(
            $"""
            WITH driver_user_map(driver_id, user_id) AS (
                VALUES {driverUserValues}
            )
            INSERT INTO order_events (id, fleet_id, order_id, type, from_status, to_status, actor_user_id, actor_role, at)

            -- Assigned: every order with an assigned_at (driver was offered the order)
            SELECT gen_random_uuid(), o.fleet_id, o.id,
                   'Assigned', 'New', 'Assigned',
                   @dispatcherUserId, 'Dispatcher', o.assigned_at
            FROM orders o
            WHERE o.fleet_id = @fleetId AND o.assigned_at IS NOT NULL

            UNION ALL

            -- Accepted: orders that reached Accepted or beyond
            SELECT gen_random_uuid(), o.fleet_id, o.id,
                   'Accepted', 'Assigned', 'Accepted',
                   dum.user_id, 'Driver', o.accepted_at
            FROM orders o
            JOIN driver_user_map dum ON dum.driver_id = o.driver_id
            WHERE o.fleet_id = @fleetId AND o.accepted_at IS NOT NULL

            UNION ALL

            -- Completed: completed orders
            SELECT gen_random_uuid(), o.fleet_id, o.id,
                   'Completed', 'InProgress', 'Completed',
                   dum.user_id, 'Driver', o.completed_at
            FROM orders o
            JOIN driver_user_map dum ON dum.driver_id = o.driver_id
            WHERE o.fleet_id = @fleetId AND o.completed_at IS NOT NULL

            UNION ALL

            -- Cancelled: all cancelled orders (actor based on cancelled_by_role)
            SELECT gen_random_uuid(), o.fleet_id, o.id,
                   'Cancelled',
                   CASE
                       WHEN o.arrived_at  IS NOT NULL THEN 'Arrived'
                       WHEN o.accepted_at IS NOT NULL THEN 'Accepted'
                       WHEN o.assigned_at IS NOT NULL THEN 'Assigned'
                       ELSE 'New'
                   END,
                   'Cancelled',
                   CASE WHEN o.cancelled_by_role = 'Dispatcher' THEN @dispatcherUserId ELSE NULL END,
                   COALESCE(o.cancelled_by_role, 'Customer'),
                   o.cancelled_at
            FROM orders o
            WHERE o.fleet_id = @fleetId AND o.status = 'Cancelled'

            UNION ALL

            -- Declined: Cancelled-while-Assigned orders (driver declined the offer)
            SELECT gen_random_uuid(), o.fleet_id, o.id,
                   'Declined', 'Assigned', 'New',
                   dum.user_id, 'Driver', o.assigned_at + interval '30 seconds'
            FROM orders o
            JOIN driver_user_map dum ON dum.driver_id = o.driver_id
            WHERE o.fleet_id = @fleetId
              AND o.status = 'Cancelled'
              AND o.assigned_at IS NOT NULL
              AND o.accepted_at IS NULL
              AND o.driver_id IS NOT NULL

            UNION ALL

            -- Timeout: same Cancelled-while-Assigned subset with NULL actor (System)
            SELECT gen_random_uuid(), o.fleet_id, o.id,
                   'Timeout', 'Assigned', 'New',
                   NULL, 'System', o.assigned_at + interval '45 seconds'
            FROM orders o
            WHERE o.fleet_id = @fleetId
              AND o.status = 'Cancelled'
              AND o.assigned_at IS NOT NULL
              AND o.accepted_at IS NULL
              AND o.driver_id IS NOT NULL;
            """,
            [
                new Npgsql.NpgsqlParameter("fleetId", fleetId),
                new Npgsql.NpgsqlParameter("dispatcherUserId", dispatcherUserId)
            ],
            ct);
#pragma warning restore EF1002
    }
}
