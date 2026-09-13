using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Gdpr;
using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Jobs;

/// <summary>Daily data-retention / GDPR maintenance job (UC-007):
/// <list type="number">
///   <item>Anonymizes the customer identity on orders older than 24 months (order ROW kept so reports
///     still count it) via the shared <see cref="CustomerAnonymizer"/>.</item>
///   <item>Deletes <c>sms_codes</c> whose <c>ExpiresAt</c> is older than 1 day.</item>
///   <item>Deletes <c>refresh_tokens</c> that expired more than 30 days ago.</item>
/// </list>
/// Driver-position history retention is NOT in v1 (no position-history table — see docs/decisions.md).
/// <para><b>Testability</b>: business logic lives in <see cref="RunTickAsync"/>; <c>ExecuteAsync</c> is a
/// thin <see cref="PeriodicTimer"/> shell (CLAUDE.md WI-14). The anonymize scan is cross-tenant via
/// <c>IgnoreQueryFilters</c>; each order is anonymized in a fresh scope with the tenant set from the
/// order so the SaveChanges guard passes.</para></summary>
internal sealed class RetentionJob(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<RetentionJob> logger) : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromHours(24);

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

    /// <summary>Runs one retention tick: anonymize old orders, prune expired SMS codes + refresh tokens.
    /// Called directly by integration tests (deterministic, no timer).</summary>
    /// <param name="ct">Cancellation token.</param>
    public async Task RunTickAsync(CancellationToken ct)
    {
        var now = timeProvider.GetUtcNow();
        var anonCutoff = now.AddMonths(-24);

        await AnonymizeOldOrdersAsync(anonCutoff, ct);
        await PruneSmsCodesAsync(now.AddDays(-1), ct);
        await PruneRefreshTokensAsync(now.AddDays(-30), ct);
    }

    /// <summary>Anonymizes orders created before the cutoff that still carry a real customer identity.</summary>
    private async Task AnonymizeOldOrdersAsync(DateTimeOffset cutoff, CancellationToken ct)
    {
        // Scan phase: one read-only cross-tenant scope, minimal projection.
        List<(Guid OrderId, Guid FleetId)> candidates;
        await using (var scanScope = scopeFactory.CreateAsyncScope())
        {
            var scanDb = scanScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            candidates = await scanDb.Orders.IgnoreQueryFilters().AsNoTracking()
                .Where(o => o.CreatedAt < cutoff && o.CustomerPhone != CustomerAnonymizer.SentinelPhone)
                .Select(o => new ValueTuple<Guid, Guid>(o.Id, o.FleetId))
                .ToListAsync(ct);
        }

        foreach (var (orderId, fleetId) in candidates)
        {
            // One scope per order with the tenant set so the SaveChanges guard permits the write.
            await using var scope = scopeFactory.CreateAsyncScope();
            var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
            tenant.FleetId = fleetId;
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

            var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct);
            if (order is null) continue;

            CustomerAnonymizer.Anonymize(order);
            await db.SaveChangesAsync(ct);
        }

        if (candidates.Count > 0)
        {
            logger.LogInformation("Orders anonymized {Count}", candidates.Count);
        }
    }

    /// <summary>Deletes SMS codes whose expiry is older than the cutoff.</summary>
    private async Task PruneSmsCodesAsync(DateTimeOffset cutoff, CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var deleted = await db.SmsCodes
            .Where(c => c.ExpiresAt < cutoff)
            .ExecuteDeleteAsync(ct);

        if (deleted > 0)
        {
            logger.LogInformation("SMS codes pruned {Count}", deleted);
        }
    }

    /// <summary>Deletes refresh tokens that expired before the cutoff.</summary>
    private async Task PruneRefreshTokensAsync(DateTimeOffset cutoff, CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var deleted = await db.RefreshTokens
            .Where(t => t.ExpiresAt < cutoff)
            .ExecuteDeleteAsync(ct);

        if (deleted > 0)
        {
            logger.LogInformation("Refresh tokens pruned {Count}", deleted);
        }
    }
}
