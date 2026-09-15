using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Taxi.Api.Common.Geo;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Two-tier geo-provider response cache.
/// <list type="bullet">
///   <item>L1: process-local <see cref="IMemoryCache"/> (singleton; sub-millisecond lookup).</item>
///   <item>L2: Postgres <c>geo_cache</c> table via <see cref="TaxiDbContext"/> (scoped; survives restarts).</item>
/// </list>
/// Registered as SCOPED because it depends on the scoped <see cref="TaxiDbContext"/>; it composes a
/// SINGLETON <see cref="IMemoryCache"/> — never the reverse (singleton capturing DbContext is a captive-dependency bug).
/// <para>TTL policy per spec §3:
/// Suggest = 7 days; Geocode = 30 days; Reverse = 30 days; Route = 24 hours; QuickPlace = forever (null).</para>
/// Usage recording via <see cref="GeoUsageRecorder"/> is performed only on a genuine upstream Success miss.
/// The accounting site is here (not in the IGeoService caller) so every consumer gets consistent counting.
/// WI-07's IGeoService must NOT double-record — it should pass a <c>recordUsage: false</c> flag or rely on the
/// counter incremented here.</summary>
internal sealed class GeoCache(
    IMemoryCache memoryCache,
    TaxiDbContext dbContext,
    TimeProvider timeProvider,
    GeoUsageRecorder usageRecorder)
{
    // ── public surface ────────────────────────────────────────────────────────────────────

    /// <summary>Tries to return a cached result for <paramref name="key"/>.
    /// On L1 miss + valid L2 row: hydrates L1 and returns.
    /// On L1+L2 miss (or stale L2): invokes <paramref name="factory"/>.
    ///   If factory returns <see cref="GeoResult{T}.Success"/>: writes L1 + upserts L2 + records usage.
    ///   If factory returns <see cref="GeoResult{T}.Unavailable"/>: does NOT cache, does NOT record usage.
    /// Never projects <see cref="JsonDocument"/> inside a LINQ Select (CLAUDE.md trap).</summary>
    /// <typeparam name="T">The typed payload of a successful geo result.</typeparam>
    /// <param name="fleetId">The fleet scoping this cache entry (explicit; no global query filter on geo tables).</param>
    /// <param name="kind">The geo-provider call kind.</param>
    /// <param name="key">The normalised cache key (output of <see cref="Common.Geo.GeoCacheKey"/>).</param>
    /// <param name="factory">Async factory to call on cache miss (the real Mapy.com client call).</param>
    /// <param name="ct">Cancellation token.</param>
    public async Task<GeoCacheResult<T>> GetOrAddAsync<T>(
        Guid fleetId,
        GeoCacheKind kind,
        string key,
        Func<CancellationToken, Task<GeoResult<T>>> factory,
        CancellationToken ct)
    {
        var l1Key = BuildL1Key(fleetId, kind, key);

        // ── L1 check ──────────────────────────────────────────────────────────────────────
        if (memoryCache.TryGetValue<T>(l1Key, out var l1Value))
        {
            return new GeoCacheResult<T>(new GeoResult<T>.Success(l1Value!), WasHit: true);
        }

        // ── L2 check ──────────────────────────────────────────────────────────────────────
        // Load the full row — do NOT project RootElement in a Select (CLAUDE.md#JsonDocument-projection trap).
        var row = await dbContext.GeoCacheEntries
            .AsNoTracking()
            .Where(e => e.FleetId == fleetId && e.Kind == kind && e.Key == key)
            .FirstOrDefaultAsync(ct);

        var ttl = TtlForKind(kind);
        var now = timeProvider.GetUtcNow();

        if (row is not null && row.Value is not null)
        {
            // A row is a cache HIT only if it is not expired (or has infinite TTL).
            var isValid = ttl is null || (row.CreatedAt + ttl.Value) >= now;
            if (isValid)
            {
                // Deserialize in memory (never in a LINQ Select).
                // row.Value is a transient JsonDocument from an AsNoTracking load — dispose after use.
                var rawText = row.Value.RootElement.GetRawText();
                row.Value.Dispose();
                var l2Value = JsonSerializer.Deserialize<T>(rawText)!;
                // Hydrate L1 so subsequent calls in this process skip the DB.
                SetL1(l1Key, l2Value, kind);
                return new GeoCacheResult<T>(new GeoResult<T>.Success(l2Value), WasHit: true);
            }
            // else: stale row → fall through to factory (miss). Dispose the stale doc.
            row.Value.Dispose();
        }

        // ── factory call (genuine upstream call) ──────────────────────────────────────────
        var factoryResult = await factory(ct);

        if (factoryResult is GeoResult<T>.Success success)
        {
            // Write L1.
            SetL1(l1Key, success.Value, kind);

            // Upsert L2 — use tracked load to detect existing row and update it (avoids 23505 on stale row).
            await UpsertL2Async(fleetId, kind, key, success.Value, now, ct);

            // Record usage (only on Success miss — not on hits, not on Unavailable).
            await usageRecorder.RecordAsync(fleetId, kind, ct);
        }

        return new GeoCacheResult<T>(factoryResult, WasHit: false);
    }

    // ── private helpers ───────────────────────────────────────────────────────────────────

    /// <summary>Builds the L1 MemoryCache key. Must include fleetId+kind+key to prevent cross-fleet collision
    /// (IMemoryCache is an app-wide singleton).</summary>
    private static string BuildL1Key(Guid fleetId, GeoCacheKind kind, string key) =>
        $"geo:{fleetId}:{kind}:{key}";

    /// <summary>Returns the TTL for a given geo kind, or <see langword="null"/> for QuickPlace (forever).
    /// Delegates to the shared <see cref="GeoCacheTtl"/> helper — constants are not duplicated here.</summary>
    private static TimeSpan? TtlForKind(GeoCacheKind kind) => GeoCacheTtl.ForKind(kind);

    /// <summary>Stores a value in L1 with an absolute expiry matching the kind TTL.
    /// QuickPlace is stored with no expiry.</summary>
    private void SetL1<T>(string l1Key, T value, GeoCacheKind kind)
    {
        var ttl = TtlForKind(kind);
        if (ttl is null)
        {
            memoryCache.Set(l1Key, value);
        }
        else
        {
            var options = new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = ttl
            };
            memoryCache.Set(l1Key, value, options);
        }
    }

    /// <summary>Upserts the geo_cache row for the given composite key.
    /// Loads the existing row (tracked) and updates it in-place to avoid a PK 23505 conflict
    /// when the stale row already exists. For new rows, Adds the entity.
    /// Value is serialised from <typeparamref name="T"/> into a <see cref="JsonDocument"/>
    /// and disposed after <c>SaveChangesAsync</c>.</summary>
    private async Task UpsertL2Async<T>(
        Guid fleetId,
        GeoCacheKind kind,
        string key,
        T value,
        DateTimeOffset now,
        CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(value);

        // Load tracked (no AsNoTracking) so EF can UPDATE it if found.
        var existing = await dbContext.GeoCacheEntries
            .Where(e => e.FleetId == fleetId && e.Kind == kind && e.Key == key)
            .FirstOrDefaultAsync(ct);

        if (existing is not null)
        {
            // Existing (possibly stale) row — update in place; dispose the old doc.
            existing.Value?.Dispose();
            existing.Value = JsonDocument.Parse(json);
            existing.CreatedAt = now;
        }
        else
        {
            // New row — the JsonDocument lives on the entity until after SaveChangesAsync.
            dbContext.GeoCacheEntries.Add(new GeoCacheEntry
            {
                FleetId   = fleetId,
                Kind      = kind,
                Key       = key,
                Value     = JsonDocument.Parse(json),
                CreatedAt = now
            });
        }

        await dbContext.SaveChangesAsync(ct);
    }
}
