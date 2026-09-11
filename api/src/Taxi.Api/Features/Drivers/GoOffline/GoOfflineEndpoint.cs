using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Realtime;

namespace Taxi.Api.Features.Drivers.GoOffline;

/// <summary>Sets the calling driver offline: clears the vehicle assignment, sets status to Offline,
/// and closes the open <see cref="DriverShift"/>. Returns 204 No Content on success.</summary>
internal sealed class GoOfflineEndpoint(
    TaxiDbContext dbContext,
    TimeProvider timeProvider,
    IRealtimePublisher realtimePublisher)
    : EndpointWithoutRequest
{
    private readonly DriversFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("drivers/me/offline");
        Description(builder => builder
            .WithName(nameof(GoOfflineEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DriverOnly));

        Summary(s =>
        {
            s.Summary = "Go offline";
            s.Description = "Sets the driver status to Offline, clears the vehicle assignment, and closes the open shift. " +
                            "Cannot go offline while EnRoute or Busy (active ride in progress).";
            s.Responses[StatusCodes.Status204NoContent] = "Driver is now offline.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a driver.";
            s.Responses[StatusCodes.Status404NotFound] = "Driver row not found.";
            s.Responses[StatusCodes.Status409Conflict] = "Driver is already offline or has an active ride.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        // Resolve caller's driver row via sub claim.
        var subClaim = User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subClaim, out var userId))
        {
            await Send.NotFoundAsync(ct); return;
        }

        var driver = await dbContext.Drivers
            .FirstOrDefaultAsync(d => d.UserId == userId, ct);
        if (driver is null) { await Send.NotFoundAsync(ct); return; }

        // Guard: already offline.
        if (driver.Status == DriverStatus.Offline)
        {
            AddError("Driver is already offline.", ErrorCodes.Driver.AlreadyOffline);
            await Send.ErrorsAsync(409, ct);
            return;
        }

        // Guard: active ride in progress.
        if (driver.Status is DriverStatus.EnRoute or DriverStatus.Busy)
        {
            AddError("Cannot go offline while on an active ride.", ErrorCodes.Driver.ActiveRide);
            await Send.ErrorsAsync(409, ct);
            return;
        }

        var now = timeProvider.GetUtcNow();

        driver.Status = DriverStatus.Offline;
        driver.CurrentVehicleId = null;

        // Close the open shift (if any).
        var openShift = await dbContext.DriverShifts
            .FirstOrDefaultAsync(s => s.DriverId == driver.Id && s.EndedAt == null, ct);
        if (openShift is not null)
        {
            openShift.EndedAt = now;
        }

        await dbContext.SaveChangesAsync(ct);

        await realtimePublisher.DriverStatusChangedAsync(driver.Id, driver.FleetId, driver.Status, ct);

        await Send.NoContentAsync(ct);
    }
}
