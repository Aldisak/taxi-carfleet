using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Vehicles.UpdateVehicle;

/// <summary>Updates a vehicle (full PUT update, FleetAdmin only).
/// Returns 404 if vehicle not found or from different fleet.
/// Returns 409 if a different vehicle with the same plate exists in the fleet.</summary>
internal sealed class UpdateVehicleEndpoint(TaxiDbContext dbContext)
    : Endpoint<UpdateVehicleRequest, UpdateVehicleResponse>
{
    private readonly VehiclesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Put("vehicles/{id:guid}");
        Description(builder => builder
            .WithName(nameof(UpdateVehicleEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Update a vehicle";
            s.Description = "Full update of a vehicle's details. Plate must be unique within the fleet " +
                            "(excluding the vehicle being updated).";
            s.Responses[StatusCodes.Status200OK] = "Vehicle updated.";
            s.Responses[StatusCodes.Status400BadRequest] = "Validation error.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Vehicle not found or not in this fleet.";
            s.Responses[StatusCodes.Status409Conflict] = "A different vehicle with the same plate already exists in the fleet.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(UpdateVehicleRequest req, CancellationToken ct)
    {
        var vehicle = await dbContext.Vehicles
            .FirstOrDefaultAsync(v => v.Id == req.Id, ct);

        if (vehicle is null) { await Send.NotFoundAsync(ct); return; }

        // Check for duplicate plate (excluding self).
        var plateConflict = await dbContext.Vehicles.AsNoTracking()
            .AnyAsync(v => v.Plate == req.Plate && v.Id != req.Id, ct);
        if (plateConflict)
        {
            AddError("A vehicle with this plate already exists in the fleet.", ErrorCodes.Vehicle.DuplicatePlate);
            await Send.ErrorsAsync(409, ct);
            return;
        }

        vehicle.Plate = req.Plate;
        vehicle.Make = req.Make;
        vehicle.Model = req.Model;
        vehicle.Color = req.Color;
        vehicle.Seats = req.Seats;

        await dbContext.SaveChangesAsync(ct);

        await Send.OkAsync(
            new UpdateVehicleResponse(
                vehicle.Id, vehicle.Plate, vehicle.Make, vehicle.Model,
                vehicle.Color, vehicle.Seats, vehicle.IsActive),
            ct);
    }
}
