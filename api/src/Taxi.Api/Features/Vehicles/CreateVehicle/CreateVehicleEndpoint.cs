using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Vehicles.CreateVehicle;

/// <summary>Creates a new vehicle in the fleet (FleetAdmin only).
/// Returns 409 if a vehicle with the same plate already exists in the fleet.</summary>
internal sealed class CreateVehicleEndpoint(TaxiDbContext dbContext)
    : Endpoint<CreateVehicleRequest, CreateVehicleResponse>
{
    private readonly VehiclesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("vehicles");
        Description(builder => builder
            .WithName(nameof(CreateVehicleEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Create a vehicle";
            s.Description = "Creates a new vehicle in the fleet. Plate must be unique within the fleet. " +
                            "Note: duplicate-plate check is application-level (TOCTOU accepted for this low-concurrency operation).";
            s.Responses[StatusCodes.Status201Created] = "Vehicle created successfully.";
            s.Responses[StatusCodes.Status400BadRequest] = "Validation error.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status409Conflict] = "A vehicle with the same plate already exists in this fleet.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CreateVehicleRequest req, CancellationToken ct)
    {
        // App-level duplicate plate check (TOCTOU accepted — no unique index in this WI).
        var plateExists = await dbContext.Vehicles.AsNoTracking()
            .AnyAsync(v => v.Plate == req.Plate, ct);
        if (plateExists)
        {
            AddError("A vehicle with this plate already exists in the fleet.", ErrorCodes.Vehicle.DuplicatePlate);
            await Send.ErrorsAsync(409, ct);
            return;
        }

        var vehicle = new Vehicle
        {
            Id = Guid.CreateVersion7(),
            Plate = req.Plate,
            Make = req.Make,
            Model = req.Model,
            Color = req.Color,
            Seats = req.Seats,
            IsActive = true
        };
        dbContext.Vehicles.Add(vehicle);
        await dbContext.SaveChangesAsync(ct);

        await Send.CreatedAtAsync<GetVehicle.GetVehicleEndpoint>(
            new { id = vehicle.Id },
            new CreateVehicleResponse(
                vehicle.Id, vehicle.Plate, vehicle.Make, vehicle.Model,
                vehicle.Color, vehicle.Seats, vehicle.IsActive),
            cancellation: ct);
    }
}
