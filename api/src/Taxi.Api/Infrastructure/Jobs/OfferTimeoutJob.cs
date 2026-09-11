using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Jobs;

/// <summary>Hosted service that polls every 5 s for <see cref="OrderStatus.Assigned"/> orders
/// whose offer has expired (<c>AssignedAt + FleetSettings.OfferTimeoutSeconds &lt; now</c>) and
/// applies the <see cref="OrderTransition.Timeout"/> transition via <see cref="OrderService"/>.
/// <para>
/// <b>Restart-safe</b>: all state lives in the database. A fresh instance after a process restart
/// will pick up timed-out orders on the first tick without any in-memory warm-up.
/// </para>
/// <para>
/// <b>Concurrency</b>: two overlapping ticks (or two instances) may scan the same Assigned order.
/// <see cref="OrderService"/> uses optimistic concurrency (Version token). The first transition wins;
/// the second receives <see cref="TransitionFailureKind.StaleVersion"/> or
/// <see cref="TransitionFailureKind.IllegalTransition"/> (order is already New) — both are logged
/// at Debug as benign skips. The order times out exactly once.
/// </para>
/// <para>
/// <b>Testability</b>: business logic lives in <see cref="RunTickAsync"/>. <c>ExecuteAsync</c> is
/// a thin PeriodicTimer shell. Tests call <c>RunTickAsync</c> directly — deterministic, no timer waits.
/// </para>
/// </summary>
internal sealed class OfferTimeoutJob(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<OfferTimeoutJob> logger) : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(5);
    private const int DefaultTimeoutSeconds = 45;

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TickInterval, timeProvider);

        // WaitForNextTickAsync waits for the first interval before firing.
        // This avoids an immediate startup tick while the host is still initialising.
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

    /// <summary>Performs one scan-and-timeout tick. Called by <c>ExecuteAsync</c> and directly
    /// by integration tests for deterministic execution without a timer.</summary>
    /// <param name="ct">Cancellation token.</param>
    public async Task RunTickAsync(CancellationToken ct)
    {
        var now = timeProvider.GetUtcNow();

        // Scan phase: one scope, read-only, cross-tenant via IgnoreQueryFilters.
        // Project minimal columns; compute per-fleet timeout (null FleetSettings → default 45 s).
        // We compute the deadline in memory to avoid EF Core LINQ translation issues with
        // DateTimeOffset arithmetic involving a column operand.
        List<(Guid OrderId, Guid FleetId, DateTimeOffset AssignedAt, int TimeoutSeconds)> candidates;

        await using (var scanScope = scopeFactory.CreateAsyncScope())
        {
            var scanDb = scanScope.ServiceProvider.GetRequiredService<TaxiDbContext>();

            // Left-join Orders with FleetSettings for per-fleet timeout.
            // IgnoreQueryFilters because this is a system (cross-tenant) scan.
            var rows = await scanDb.Orders.IgnoreQueryFilters()
                .AsNoTracking()
                .Where(o => o.Status == OrderStatus.Assigned && o.AssignedAt != null)
                .Select(o => new
                {
                    o.Id,
                    o.FleetId,
                    o.AssignedAt,
                    // Cast to nullable int so that when no FleetSettings row exists, FirstOrDefault
                    // returns null (not 0 — the int default) and the in-memory fallback kicks in.
                    TimeoutSeconds = (int?)scanDb.FleetSettings
                        .IgnoreQueryFilters()
                        .Where(fs => fs.FleetId == o.FleetId)
                        .Select(fs => (int?)fs.OfferTimeoutSeconds)
                        .FirstOrDefault()
                })
                .ToListAsync(ct);

            // Filter in memory: candidates where AssignedAt + timeout < now.
            candidates = rows
                .Where(r => r.AssignedAt!.Value.AddSeconds(r.TimeoutSeconds ?? DefaultTimeoutSeconds) < now)
                .Select(r => (r.Id, r.FleetId, r.AssignedAt!.Value, r.TimeoutSeconds ?? DefaultTimeoutSeconds))
                .ToList();
        }

        // Transition phase: one scope per order — avoids a poisoned change-tracker on StaleVersion.
        foreach (var (orderId, fleetId, _, _) in candidates)
        {
            try
            {
                await TimeoutOrderAsync(orderId, fleetId, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Order timeout failed {OrderId} {Reason}",
                    orderId, "PerOrderException");
            }
        }
    }

    /// <summary>Applies the Timeout transition to a single order using a fresh scoped context.
    /// Sets the tenant context so OrderService can load the order through the EF query filter.</summary>
    private async Task TimeoutOrderAsync(Guid orderId, Guid fleetId, CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();

        // Set tenant so the non-IgnoreQueryFilters load in OrderService finds the order.
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;

        var orderService = scope.ServiceProvider.GetRequiredService<OrderService>();
        var result = await orderService.TransitionAsync(
            orderId,
            OrderTransition.Timeout,
            Actor.System,
            payload: null,
            ct);

        if (result.IsSuccess)
        {
            logger.LogInformation("Order timed out {OrderId} {FleetId}", orderId, fleetId);
        }
        else
        {
            // StaleVersion = another tick won the race. IllegalTransition = order already New.
            // Both are benign — the order has already been handled or will be on the next scan.
            logger.LogDebug(
                "Order timeout skipped {OrderId} {FleetId} {Reason}",
                orderId, fleetId, result.FailureKind.ToString());
        }
    }
}
