using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Common.Tracking;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Public.TrackByCode;

/// <summary>Public (logged-out) order tracking via the signed SMS link.
/// <para>Anonymous: the SMS recipient may not have an app account. The fleet is resolved from the
/// slug/subdomain by the tenant middleware; the order is loaded by public code within that fleet
/// scope; the signed token binds the link to this specific order and expiry. FleetHub is
/// <c>[Authorize]</c>, so the logged-out path cannot use SignalR — the client polls this endpoint.</para>
/// <para>All no-leak denials: unknown code within the resolved fleet → 404; no fleet resolved → 404;
/// bad/expired/tampered token or past the post-completion window → 410 Tracking.LinkExpired.</para></summary>
internal sealed class TrackByCodeEndpoint(
    TaxiDbContext dbContext,
    ICurrentTenant currentTenant,
    TrackingTokenService tokenService)
    : Endpoint<TrackByCodeRequest, TrackByCodeResponse>
{
    private readonly PublicFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("public/track/{code}");
        Description(builder => builder
            .WithName(nameof(TrackByCodeEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        AllowAnonymous();

        Summary(s =>
        {
            s.Summary = "Track an order via the public SMS link";
            s.Description = "Anonymous tracking for the logged-out customer. Requires the fleet slug " +
                            "(X-Fleet-Slug header or subdomain) and the signed token (?k=). " +
                            "Returns a reduced DTO (no phone, no customer id). Invalid/expired links return 410.";
            s.Responses[StatusCodes.Status200OK] = "Reduced public tracking DTO.";
            s.Responses[StatusCodes.Status400BadRequest] = "Missing code or token.";
            s.Responses[StatusCodes.Status404NotFound] = "Unknown code within the resolved fleet, or no fleet resolved.";
            s.Responses[StatusCodes.Status410Gone] = "The tracking link is invalid, expired, or tampered.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(TrackByCodeRequest req, CancellationToken ct)
    {
        // Guard: no fleet resolved → 404 (no unscoped query).
        if (currentTenant.FleetId is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        // Load the order by public code within the fleet query-filter scope.
        var order = await dbContext.Orders.AsNoTracking()
            .FirstOrDefaultAsync(o => o.PublicCode == req.Code, ct);

        if (order is null) { await Send.NotFoundAsync(ct); return; }

        // Validate the signed token against this order (signature + expiry + post-completion window).
        if (!tokenService.Validate(req.K ?? string.Empty, order.Id, order.CompletedAt))
        {
            AddError("The tracking link is invalid or has expired.", ErrorCodes.Tracking.LinkExpired);
            await Send.ErrorsAsync(410, ct);
            return;
        }

        string? driverFirstName = null;
        string? vehiclePlate = null;
        string? vehicleColor = null;
        TrackPositionDto? position = null;

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

                if (IsActiveStatus(order.Status) && driver.LastLat.HasValue && driver.LastLng.HasValue)
                {
                    position = new TrackPositionDto(driver.LastLat.Value, driver.LastLng.Value);
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

        var displayPrice = order.FinalPriceCzk ?? order.FixedPriceCzk ?? order.EstimatedPriceCzk;

        await Send.OkAsync(new TrackByCodeResponse(
            order.PublicCode,
            order.Status.ToString(),
            order.PickupAddress,
            order.DropoffAddress,
            order.ScheduledAt,
            driverFirstName,
            vehiclePlate,
            vehicleColor,
            position,
            order.PriceType.ToString(),
            displayPrice), ct);
    }

    /// <summary>Returns true when the order status represents an active ride where driver position is meaningful.</summary>
    private static bool IsActiveStatus(OrderStatus status) =>
        status is OrderStatus.Accepted or OrderStatus.Arrived or OrderStatus.InProgress;
}
