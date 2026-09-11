using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Vehicles.DeleteVehicle;

/// <summary>Deactivates a vehicle (soft delete, FleetAdmin only).
/// Sets <c>IsActive = false</c> rather than removing the row to preserve referential integrity
/// with historical orders and driver shifts.</summary>
internal sealed class DeleteVehicleEndpoint(TaxiDbContext dbContext)
    : Endpoint<DeleteVehicleRequest>
{
    private readonly VehiclesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Delete("vehicles/{id:guid}");
        Description(builder => builder
            .WithName(nameof(DeleteVehicleEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Delete (deactivate) a vehicle";
            s.Description = "Sets IsActive=false. The vehicle row is retained to preserve referential integrity " +
                            "with historical orders and driver shifts.";
            s.Responses[StatusCodes.Status204NoContent] = "Vehicle deactivated.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Vehicle not found or not in this fleet.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(DeleteVehicleRequest req, CancellationToken ct)
    {
        var vehicle = await dbContext.Vehicles
            .FirstOrDefaultAsync(v => v.Id == req.Id, ct);

        if (vehicle is null) { await Send.NotFoundAsync(ct); return; }

        vehicle.IsActive = false;
        await dbContext.SaveChangesAsync(ct);

        await Send.NoContentAsync(ct);
    }
}
