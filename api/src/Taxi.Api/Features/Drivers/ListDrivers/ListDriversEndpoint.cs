using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Drivers.ListDrivers;

/// <summary>Returns a list of all drivers in the current fleet (Dispatcher/FleetAdmin only).</summary>
internal sealed class ListDriversEndpoint(TaxiDbContext dbContext)
    : EndpointWithoutRequest<ListDriversResponse>
{
    private readonly DriversFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("drivers");
        Description(builder => builder
            .WithName(nameof(ListDriversEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DispatcherOnly));

        Summary(s =>
        {
            s.Summary = "List drivers";
            s.Description = "Returns all drivers in the current fleet. Dispatcher/FleetAdmin only. " +
                            "Global query filter enforces tenant isolation.";
            s.Responses[StatusCodes.Status200OK] = "List of driver summaries.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a dispatcher or fleet admin.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        // Load drivers with user display names and optional vehicle plates.
        // Tenant query filter is applied automatically for drivers (and vehicles).
        var drivers = await dbContext.Drivers.AsNoTracking()
            .Join(
                dbContext.Users.AsNoTracking(),
                d => d.UserId,
                u => u.Id,
                (d, u) => new
                {
                    d.Id,
                    d.Status,
                    d.CurrentVehicleId,
                    d.LastPositionAt,
                    u.DisplayName
                })
            .ToListAsync(ct);

        // Build vehicle plate lookup for active vehicles.
        var vehicleIds = drivers
            .Where(d => d.CurrentVehicleId.HasValue)
            .Select(d => d.CurrentVehicleId!.Value)
            .Distinct()
            .ToList();

        Dictionary<Guid, string> vehiclePlates = new();
        if (vehicleIds.Count > 0)
        {
            vehiclePlates = await dbContext.Vehicles.AsNoTracking()
                .Where(v => vehicleIds.Contains(v.Id))
                .ToDictionaryAsync(v => v.Id, v => v.Plate, ct);
        }

        var items = drivers
            .Select(d => new DriverSummaryDto(
                d.Id,
                d.DisplayName,
                d.Status.ToString(),
                d.CurrentVehicleId.HasValue ? vehiclePlates.GetValueOrDefault(d.CurrentVehicleId.Value) : null,
                d.LastPositionAt))
            .ToList();

        await Send.OkAsync(new ListDriversResponse(items), ct);
    }
}
