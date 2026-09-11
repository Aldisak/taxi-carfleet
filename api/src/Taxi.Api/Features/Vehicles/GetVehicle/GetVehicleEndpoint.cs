using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Vehicles.GetVehicle;

/// <summary>Returns a single vehicle by ID (FleetAdmin only). Returns 404 if the vehicle
/// does not exist or belongs to a different fleet (no-leak).</summary>
internal sealed class GetVehicleEndpoint(TaxiDbContext dbContext)
    : Endpoint<GetVehicleRequest, GetVehicleResponse>
{
    private readonly VehiclesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("vehicles/{id:guid}");
        Description(builder => builder
            .WithName(nameof(GetVehicleEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Get vehicle detail";
            s.Responses[StatusCodes.Status200OK] = "Vehicle detail.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Vehicle not found or not in this fleet.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(GetVehicleRequest req, CancellationToken ct)
    {
        var vehicle = await dbContext.Vehicles.AsNoTracking()
            .FirstOrDefaultAsync(v => v.Id == req.Id, ct);

        if (vehicle is null) { await Send.NotFoundAsync(ct); return; }

        await Send.OkAsync(
            new GetVehicleResponse(
                vehicle.Id, vehicle.Plate, vehicle.Make, vehicle.Model,
                vehicle.Color, vehicle.Seats, vehicle.IsActive),
            ct);
    }
}
