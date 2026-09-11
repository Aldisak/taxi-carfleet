using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Orders.GetOrderByCode;

/// <summary>Returns a reduced tracking DTO for the customer who owns the order.
/// <para>Tenant resolution: customer JWT carries no fleet_id — X-Fleet-Slug header is required
/// (tenant middleware resolves via header). This is consistent with WI-08 customer create-order
/// which also uses X-Fleet-Slug. PublicCode is unique per-fleet only (index: fleet_id, public_code),
/// so an unscoped cross-fleet lookup would be ambiguous. Cross-fleet customer tracking without a
/// fleet slug is deferred to the signed-token path in assignment 05.</para>
/// <para>Access: CustomerOnly policy. Ownership check (CustomerUserId == sub) applied in handler.
/// All denials return 404 (no-leak).</para>
/// </summary>
internal sealed class GetOrderByCodeEndpoint(TaxiDbContext dbContext)
    : Endpoint<GetOrderByCodeRequest, TrackOrderResponse>
{
    private readonly OrdersFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("orders/by-code/{publicCode}");
        Description(builder => builder
            .WithName(nameof(GetOrderByCodeEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.CustomerOnly));

        Summary(s =>
        {
            s.Summary = "Track order by public code";
            s.Description = "Returns a reduced DTO (status, driver first name, vehicle plate/color, ETA, position). " +
                            "Requires a customer JWT + X-Fleet-Slug header (fleet context required because public codes are unique per fleet). " +
                            "ETA is always null in v1 (OSRM integration deferred to assignment 06).";
            s.Responses[StatusCodes.Status200OK] = "Reduced order tracking DTO.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a customer (CustomerOnly policy).";
            s.Responses[StatusCodes.Status404NotFound] = "Order not found or caller does not own it.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(GetOrderByCodeRequest req, CancellationToken ct)
    {
        var subClaim = User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subClaim, out var callerUserId))
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        // Tenant filter is active (X-Fleet-Slug header resolves fleet via middleware).
        // PublicCode is unique per fleet; query within the tenant scope.
        var order = await dbContext.Orders.AsNoTracking()
            .FirstOrDefaultAsync(o => o.PublicCode == req.PublicCode, ct);

        if (order is null) { await Send.NotFoundAsync(ct); return; }

        // Ownership check — no-leak 404 on failure.
        if (order.CustomerUserId != callerUserId)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        // Resolve driver name and vehicle details when assigned.
        string? driverFirstName = null;
        string? vehiclePlate = null;
        string? vehicleColor = null;
        DriverPositionDto? position = null;

        if (order.DriverId.HasValue)
        {
            var driver = await dbContext.Drivers.AsNoTracking()
                .FirstOrDefaultAsync(d => d.Id == order.DriverId.Value, ct);

            if (driver is not null)
            {
                var driverUser = await dbContext.Users.AsNoTracking()
                    .FirstOrDefaultAsync(u => u.Id == driver.UserId, ct);

                if (driverUser is not null)
                {
                    var displayName = driverUser.DisplayName ?? string.Empty;
                    driverFirstName = displayName.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
                }

                // Position: only exposed when driver is actively en-route.
                if (IsActiveStatus(order.Status) && driver.LastLat.HasValue && driver.LastLng.HasValue)
                {
                    position = new DriverPositionDto(driver.LastLat.Value, driver.LastLng.Value);
                }
            }

            if (order.VehicleId.HasValue)
            {
                var vehicle = await dbContext.Vehicles.AsNoTracking()
                    .FirstOrDefaultAsync(v => v.Id == order.VehicleId.Value, ct);

                if (vehicle is not null)
                {
                    vehiclePlate = vehicle.Plate;
                    vehicleColor = vehicle.Color;
                }
            }
        }

        await Send.OkAsync(new TrackOrderResponse(
            order.PublicCode,
            order.Status.ToString(),
            order.PickupAddress,
            order.DropoffAddress,
            order.ScheduledAt,
            driverFirstName,
            vehiclePlate,
            vehicleColor,
            EtaMinutes: null,   // v1: ETA deferred to assignment 06 (OSRM)
            position), ct);
    }

    /// <summary>Returns true when the order status represents an active ride where driver position is meaningful.</summary>
    private static bool IsActiveStatus(OrderStatus status) =>
        status is OrderStatus.Accepted or OrderStatus.Arrived or OrderStatus.InProgress;
}
