using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Vehicles.ListVehicles;

/// <summary>Returns a list of all vehicles in the current fleet (FleetAdmin only).</summary>
internal sealed class ListVehiclesEndpoint(TaxiDbContext dbContext)
    : EndpointWithoutRequest<ListVehiclesResponse>
{
    private readonly VehiclesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("vehicles");
        Description(builder => builder
            .WithName(nameof(ListVehiclesEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "List vehicles";
            s.Description = "Returns all vehicles in the current fleet. FleetAdmin only.";
            s.Responses[StatusCodes.Status200OK] = "List of vehicles.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        var vehicles = await dbContext.Vehicles.AsNoTracking()
            .Select(v => new VehicleDto(v.Id, v.Plate, v.Make, v.Model, v.Color, v.Seats, v.IsActive))
            .ToListAsync(ct);

        await Send.OkAsync(new ListVehiclesResponse(vehicles), ct);
    }
}
