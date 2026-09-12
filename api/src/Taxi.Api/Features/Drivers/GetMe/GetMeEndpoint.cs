using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Drivers.GetMe;

/// <summary>Returns the calling driver's own profile plus their current shift info.</summary>
internal sealed class GetMeEndpoint(TaxiDbContext dbContext)
    : EndpointWithoutRequest<GetMeResponse>
{
    private readonly DriversFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("drivers/me");
        Description(builder => builder
            .WithName(nameof(GetMeEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DriverOnly));

        Summary(s =>
        {
            s.Summary = "Get my driver profile";
            s.Responses[StatusCodes.Status200OK] = "Driver profile and current shift info.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a driver.";
            s.Responses[StatusCodes.Status404NotFound] = "Driver row not found for the caller.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        var subClaim = User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subClaim, out var userId))
        {
            await Send.NotFoundAsync(ct); return;
        }

        // Load driver + linked user in a single query.
        var driverData = await dbContext.Drivers.AsNoTracking()
            .Where(d => d.UserId == userId)
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
                    d.FleetId,
                    u.DisplayName
                })
            .FirstOrDefaultAsync(ct);

        if (driverData is null) { await Send.NotFoundAsync(ct); return; }

        // Load current vehicle plate if any.
        string? vehiclePlate = null;
        if (driverData.CurrentVehicleId.HasValue)
        {
            vehiclePlate = await dbContext.Vehicles.AsNoTracking()
                .Where(v => v.Id == driverData.CurrentVehicleId.Value)
                .Select(v => v.Plate)
                .FirstOrDefaultAsync(ct);
        }

        // Load open shift if any.
        var openShift = await dbContext.DriverShifts.AsNoTracking()
            .Where(s => s.DriverId == driverData.Id && s.EndedAt == null)
            .Select(s => new { s.Id, s.StartedAt })
            .FirstOrDefaultAsync(ct);

        // Load the driver's active (non-terminal) order id, if any.
        var activeOrderId = await dbContext.Orders.AsNoTracking()
            .Where(o => o.DriverId == driverData.Id
                     && (o.Status == OrderStatus.Assigned
                         || o.Status == OrderStatus.Accepted
                         || o.Status == OrderStatus.Arrived
                         || o.Status == OrderStatus.InProgress))
            .Select(o => (Guid?)o.Id)
            .FirstOrDefaultAsync(ct);

        await Send.OkAsync(new GetMeResponse(
            driverData.Id,
            driverData.DisplayName,
            driverData.Status.ToString(),
            driverData.CurrentVehicleId,
            vehiclePlate,
            driverData.LastPositionAt,
            openShift?.Id,
            openShift?.StartedAt,
            activeOrderId), ct);
    }
}
