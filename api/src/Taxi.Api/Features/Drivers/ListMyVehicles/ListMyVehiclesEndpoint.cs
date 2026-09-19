using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Drivers.ListMyVehicles;

/// <summary>Returns the active vehicles in the calling driver's fleet so the driver can pick one when
/// going online. Drivers cannot use the FleetAdmin-only <c>GET /vehicles</c> endpoint, so this
/// driver-scoped list is what feeds the go-online vehicle selector.</summary>
internal sealed class ListMyVehiclesEndpoint(TaxiDbContext dbContext)
    : EndpointWithoutRequest<ListMyVehiclesResponse>
{
    private readonly DriversFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("drivers/me/vehicles");
        Description(builder => builder
            .WithName(nameof(ListMyVehiclesEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DriverOnly));

        Summary(s =>
        {
            s.Summary = "List selectable vehicles";
            s.Description = "Returns the active vehicles in the driver's fleet for the go-online vehicle picker.";
            s.Responses[StatusCodes.Status200OK] = "Active vehicles in the driver's fleet.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a driver.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        // The tenant query filter scopes Vehicles to the caller's fleet (the driver JWT carries fleet_id).
        var vehicles = await dbContext.Vehicles.AsNoTracking()
            .Where(v => v.IsActive)
            .OrderBy(v => v.Plate)
            .Select(v => new DriverVehicleDto(v.Id, v.Plate, v.Make, v.Model))
            .ToListAsync(ct);

        await Send.OkAsync(new ListMyVehiclesResponse(vehicles), ct);
    }
}
