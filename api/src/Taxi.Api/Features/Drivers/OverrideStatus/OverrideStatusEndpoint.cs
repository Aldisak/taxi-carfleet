using System.Text.Json;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Realtime;

namespace Taxi.Api.Features.Drivers.OverrideStatus;

/// <summary>Dispatcher-only manual status override for a driver (Free/Busy/Offline).
/// Writes the first AuditLog row, publishes DriverStatusChanged, and never touches any Order.
/// Forced Offline mirrors StalePositionJob: Status=Offline, CurrentVehicleId=null, closes open DriverShift.</summary>
internal sealed class OverrideStatusEndpoint(
    TaxiDbContext dbContext,
    TimeProvider timeProvider,
    IRealtimePublisher realtimePublisher)
    : Endpoint<OverrideStatusRequest>
{
    private readonly DriversFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("drivers/{id:guid}/status");
        Description(builder => builder
            .WithName(nameof(OverrideStatusEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DispatcherOnly));

        Summary(s =>
        {
            s.Summary = "Override driver status";
            s.Description = "Manually sets a driver's status to Free, Busy, or Offline. " +
                            "Forcing Offline closes the open shift. EnRoute cannot be set manually. " +
                            "Writes an AuditLog row and publishes DriverStatusChanged. Never touches Orders.";
            s.Responses[StatusCodes.Status204NoContent] = "Status overridden successfully.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid status (EnRoute not allowed).";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a dispatcher.";
            s.Responses[StatusCodes.Status404NotFound] = "Driver not found or cross-tenant access.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(OverrideStatusRequest req, CancellationToken ct)
    {
        var driverId = Route<Guid>("id");

        // Resolve caller's user ID from sub claim.
        var subClaim = User.FindFirst("sub")?.Value;
        Guid.TryParse(subClaim, out var callerUserId);

        // Resolve driver via tenant query filter — cross-tenant/absent → no-leak 404.
        var driver = await dbContext.Drivers
            .FirstOrDefaultAsync(d => d.Id == driverId, ct);
        if (driver is null) { await Send.NotFoundAsync(ct); return; }

        var now = timeProvider.GetUtcNow();
        var oldStatus = driver.Status;
        var newStatus = req.Status;

        driver.Status = newStatus;

        // Offline path: mirror StalePositionJob / GoOfflineEndpoint.
        if (newStatus == DriverStatus.Offline)
        {
            driver.CurrentVehicleId = null;

            var openShift = await dbContext.DriverShifts
                .FirstOrDefaultAsync(s => s.DriverId == driver.Id && s.EndedAt == null, ct);
            if (openShift is not null)
            {
                openShift.EndedAt = now;
            }
        }

        // Write the first AuditLog row. FleetId is auto-stamped by SaveChanges guard.
        var diff = JsonDocument.Parse(JsonSerializer.Serialize(new { old = oldStatus.ToString(), @new = newStatus.ToString() }));
        var auditLog = new AuditLog
        {
            Id = Guid.CreateVersion7(),
            FleetId = driver.FleetId,
            Entity = "Driver",
            EntityId = driverId,
            Action = "StatusOverride",
            ActorUserId = callerUserId == Guid.Empty ? null : callerUserId,
            Diff = diff,
            At = now
        };
        dbContext.AuditLogs.Add(auditLog);

        await dbContext.SaveChangesAsync(ct);

        await realtimePublisher.DriverStatusChangedAsync(driver.Id, driver.FleetId, newStatus, ct);

        await Send.NoContentAsync(ct);
    }
}
