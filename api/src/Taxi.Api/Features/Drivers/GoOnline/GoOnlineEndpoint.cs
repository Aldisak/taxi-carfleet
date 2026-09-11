using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Realtime;

namespace Taxi.Api.Features.Drivers.GoOnline;

/// <summary>Sets the calling driver online: assigns the vehicle, sets status to Free,
/// and opens a new <see cref="DriverShift"/>. Returns 204 No Content on success.</summary>
internal sealed class GoOnlineEndpoint(
    TaxiDbContext dbContext,
    TimeProvider timeProvider,
    IRealtimePublisher realtimePublisher)
    : Endpoint<GoOnlineRequest>
{
    private readonly DriversFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("drivers/me/online");
        Description(builder => builder
            .WithName(nameof(GoOnlineEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DriverOnly));

        Summary(s =>
        {
            s.Summary = "Go online";
            s.Description = "Sets the driver status to Free, assigns the vehicle, and opens a shift. " +
                            "The vehicle must belong to the same fleet and be active.";
            s.Responses[StatusCodes.Status204NoContent] = "Driver is now online.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a driver.";
            s.Responses[StatusCodes.Status404NotFound] = "Driver row not found or vehicle not found/not active in fleet.";
            s.Responses[StatusCodes.Status409Conflict] = "Driver is already online.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(GoOnlineRequest req, CancellationToken ct)
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

        // Guard: already online.
        if (driver.Status != DriverStatus.Offline)
        {
            AddError("Driver is already online.", ErrorCodes.Driver.AlreadyOnline);
            await Send.ErrorsAsync(409, ct);
            return;
        }

        // Guard: vehicle must exist and be active in the current fleet (query filter enforces tenant).
        var vehicle = await dbContext.Vehicles.AsNoTracking()
            .FirstOrDefaultAsync(v => v.Id == req.VehicleId && v.IsActive, ct);
        if (vehicle is null) { await Send.NotFoundAsync(ct); return; }

        var now = timeProvider.GetUtcNow();

        driver.Status = DriverStatus.Free;
        driver.CurrentVehicleId = vehicle.Id;

        var shift = new DriverShift
        {
            Id = Guid.CreateVersion7(),
            FleetId = driver.FleetId,
            DriverId = driver.Id,
            VehicleId = vehicle.Id,
            StartedAt = now,
            EndedAt = null
        };
        dbContext.DriverShifts.Add(shift);

        await dbContext.SaveChangesAsync(ct);

        await realtimePublisher.DriverStatusChangedAsync(driver.Id, driver.FleetId, driver.Status, ct);

        await Send.NoContentAsync(ct);
    }
}
