using Microsoft.EntityFrameworkCore;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Realtime;

namespace Taxi.Api.Infrastructure.Jobs;

/// <summary>Hosted service that polls every 60 s for drivers with stale position data and
/// marks them <see cref="DriverStatus.Offline"/>.
/// <para>
/// A driver is considered stale when:
/// <list type="bullet">
///   <item><see cref="Driver.LastPositionAt"/> is older than 5 min (position known but stale), OR</item>
///   <item><see cref="Driver.LastPositionAt"/> is null AND the open shift <c>StartedAt</c> is
///     older than 5 min (driver went online but never reported a position).</item>
/// </list>
/// </para>
/// <para>
/// <b>Mid-ride drivers (EnRoute/Busy)</b>: marked Offline per §9 of the assignment spec ("drivers with
/// LastPositionAt older than 5 min and status != Offline"). Auto-offlining mid-ride does NOT release
/// the active order — the dispatcher must reassign. This mirrors the design text literally; a phone
/// dying mid-ride is a dispatcher problem per the SKILL.md commentary.
/// </para>
/// <para>
/// <b>GoOffline semantics mirrored</b>: same write set as <c>GoOfflineEndpoint</c>:
/// Status=Offline, CurrentVehicleId=null, open DriverShift.EndedAt=now, publish DriverStatusChanged.
/// </para>
/// <para>
/// <b>Testability</b>: business logic lives in <see cref="RunTickAsync"/>. <c>ExecuteAsync</c>
/// is a thin PeriodicTimer shell. Tests call <c>RunTickAsync</c> directly.
/// </para>
/// </summary>
internal sealed class StalePositionJob(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<StalePositionJob> logger) : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan StaleThreshold = TimeSpan.FromMinutes(5);

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

    /// <summary>Performs one stale-position scan. Called by <c>ExecuteAsync</c> and directly
    /// by integration tests for deterministic execution without a timer.</summary>
    /// <param name="ct">Cancellation token.</param>
    public async Task RunTickAsync(CancellationToken ct)
    {
        var now = timeProvider.GetUtcNow();
        var staleThresholdAt = now - StaleThreshold;

        // Scan: cross-tenant system scan via IgnoreQueryFilters.
        // Find non-Offline drivers with stale or missing positions.
        List<Guid> staleDriverIds;

        await using (var scanScope = scopeFactory.CreateAsyncScope())
        {
            var scanDb = scanScope.ServiceProvider.GetRequiredService<TaxiDbContext>();

            staleDriverIds = await scanDb.Drivers.IgnoreQueryFilters()
                .AsNoTracking()
                .Where(d => d.Status != DriverStatus.Offline &&
                            (d.LastPositionAt != null
                                ? d.LastPositionAt < staleThresholdAt
                                : scanDb.DriverShifts.IgnoreQueryFilters()
                                    .Any(s => s.DriverId == d.Id && s.EndedAt == null &&
                                              s.StartedAt < staleThresholdAt)))
                .Select(d => d.Id)
                .ToListAsync(ct);
        }

        foreach (var driverId in staleDriverIds)
        {
            try
            {
                await MarkDriverOfflineAsync(driverId, now, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Driver offline failed {DriverId} {Reason}",
                    driverId, "PerDriverException");
            }
        }
    }

    /// <summary>Marks a single driver offline: Status=Offline, CurrentVehicleId=null, closes open shift,
    /// publishes DriverStatusChanged. Uses a fresh scoped context with IgnoreQueryFilters for the
    /// cross-tenant write (system actor sanctioned for this operation).</summary>
    private async Task MarkDriverOfflineAsync(Guid driverId, DateTimeOffset now, CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var publisher = scope.ServiceProvider.GetRequiredService<IRealtimePublisher>();

        var driver = await db.Drivers.IgnoreQueryFilters()
            .FirstOrDefaultAsync(d => d.Id == driverId, ct);
        if (driver is null) return;

        // Guard: already offline (could be changed between scan and write).
        if (driver.Status == DriverStatus.Offline) return;

        var previousStatus = driver.Status;
        driver.Status = DriverStatus.Offline;
        driver.CurrentVehicleId = null;

        // Close the open shift (same semantics as GoOfflineEndpoint).
        var openShift = await db.DriverShifts.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.DriverId == driverId && s.EndedAt == null, ct);
        if (openShift is not null)
        {
            openShift.EndedAt = now;
        }

        // SaveChanges uses null-tenant scope: IgnoreQueryFilters + explicit FleetId on entity.
        // The guard in TaxiDbContext.GuardTenantEntities only fires for non-null currentTenant.
        await db.SaveChangesAsync(ct);

        await publisher.DriverStatusChangedAsync(driverId, driver.FleetId, DriverStatus.Offline, ct);

        logger.LogInformation(
            "Driver marked offline {DriverId} {FleetId} {PreviousStatus}",
            driverId, driver.FleetId, previousStatus);
    }
}
