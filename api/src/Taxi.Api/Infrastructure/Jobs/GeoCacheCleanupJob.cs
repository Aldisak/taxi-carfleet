using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Geo;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Jobs;

/// <summary>Hourly background job that sweeps expired rows from the <c>geo_cache</c> table.
/// Per spec §3, TTLs are: Suggest = 7 d, Geocode = 30 d, Reverse = 30 d, Route = 24 h.
/// <see cref="GeoCacheKind.QuickPlace"/> is intentionally NEVER swept — it has an infinite TTL
/// and is only invalidated explicitly on Place edits.
/// <para><b>Testability:</b> business logic lives in <see cref="RunTickAsync"/>; <c>ExecuteAsync</c> is a
/// thin <see cref="PeriodicTimer"/> shell. Tests construct this class directly and call
/// <see cref="RunTickAsync"/> for deterministic, timer-free execution.</para></summary>
internal sealed class GeoCacheCleanupJob(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<GeoCacheCleanupJob> logger) : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromHours(1);

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TickInterval, timeProvider);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await RunTickAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Tick failed {Reason}", "UnhandledTickException");
            }
        }
    }

    /// <summary>Runs one cleanup tick: for each swept kind deletes geo_cache rows whose
    /// <c>CreatedAt</c> is older than the kind's configured TTL.
    /// Called directly by integration tests (deterministic, no timer waits).</summary>
    /// <param name="ct">Cancellation token.</param>
    public async Task RunTickAsync(CancellationToken ct)
    {
        var now = timeProvider.GetUtcNow();
        var totalDeleted = 0;

        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        foreach (var kind in GeoCacheTtl.SweptKinds)
        {
            var ttl = GeoCacheTtl.ForKind(kind);
            if (ttl is null) continue; // defensive; SweptKinds never contains QuickPlace

            var cutoff = now - ttl.Value;

            var deleted = await db.GeoCacheEntries
                .Where(c => c.Kind == kind && c.CreatedAt < cutoff)
                .ExecuteDeleteAsync(ct);

            totalDeleted += deleted;
        }

        if (totalDeleted > 0)
        {
            logger.LogInformation("Geo cache swept {Count}", totalDeleted);
        }
    }
}
