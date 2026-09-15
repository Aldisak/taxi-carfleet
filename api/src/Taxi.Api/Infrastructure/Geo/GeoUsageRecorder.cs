using Microsoft.EntityFrameworkCore;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Records geo-provider API usage atomically via an SQL upsert.
/// Called ONLY on a genuine upstream Success miss — not on L1/L2 cache hits, not on Unavailable results.
/// After recording, triggers <see cref="GeoBudgetAlertService"/> to check monthly thresholds.
/// Registered as Scoped (depends on scoped TaxiDbContext).</summary>
internal sealed class GeoUsageRecorder(
    TaxiDbContext dbContext,
    TimeProvider timeProvider,
    GeoBudgetAlertService alertService)
{
    private const int CreditsPerCall = 4;

    /// <summary>Atomically increments the calls and credits_est counters for the given fleet, day, and kind
    /// via INSERT … ON CONFLICT … DO UPDATE (no lost update under concurrent misses).
    /// After recording, checks whether any budget threshold (80%/100%) has been newly crossed
    /// and fires a push alert if so.
    /// The <paramref name="kind"/> is persisted as its enum string name to match the enum-as-string convention.</summary>
    /// <param name="fleetId">The fleet that consumed the credit.</param>
    /// <param name="kind">The geo-provider API kind (stored as string).</param>
    /// <param name="ct">Cancellation token.</param>
    public async Task RecordAsync(Guid fleetId, GeoCacheKind kind, CancellationToken ct)
    {
        // Prague-local calendar day for the usage row.
        var pragueTimeZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague");
        var localNow = TimeZoneInfo.ConvertTime(timeProvider.GetUtcNow(), pragueTimeZone);
        var day = DateOnly.FromDateTime(localNow.DateTime);

        // Enum stored as string to match the EF enum-as-string convention; use ToString() not (int).
        var kindStr = kind.ToString();

        // ATOMIC upsert — prevents lost updates from concurrent misses in the same fleet/day/kind.
        // EF Core: ExecuteSqlInterpolatedAsync accepts a FormattableString — parameters are safely escaped.
        // Using a single interpolated string expression so the compiler produces FormattableString, not string.
        await dbContext.Database.ExecuteSqlInterpolatedAsync(
            $"INSERT INTO geo_usage (fleet_id, day, kind, calls, credits_est) VALUES ({fleetId}, {day}, {kindStr}, 1, {CreditsPerCall}) ON CONFLICT (fleet_id, day, kind) DO UPDATE SET calls = geo_usage.calls + EXCLUDED.calls, credits_est = geo_usage.credits_est + EXCLUDED.credits_est",
            ct);

        // Check budget thresholds after recording — fires push alert if 80% or 100% is newly crossed.
        await alertService.CheckAndAlertAsync(fleetId, ct);
    }
}
