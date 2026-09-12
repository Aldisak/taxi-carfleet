using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Orders;
using Taxi.Api.Features.Orders.Shared;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Orders.GetOrder;

/// <summary>Returns full order detail for the requested order.
/// <para>Access rules (all denials are no-leak 404):
/// <list type="bullet">
/// <item>Dispatcher of the fleet: always allowed (tenant query filter enforces fleet isolation).</item>
/// <item>Driver: only if they are the assigned driver.</item>
/// <item>Customer: only if CustomerUserId matches their sub claim.</item>
/// </list>
/// No Policies() call — requires authenticated user (FastEndpoints default). Fine-grained role
/// gating is enforced in HandleAsync. All denials return 404 to avoid leaking order existence.</para>
/// </summary>
internal sealed class GetOrderEndpoint(TaxiDbContext dbContext)
    : Endpoint<GetOrderRequest, GetOrderResponse>
{
    private readonly OrdersFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("orders/{id:guid}");
        Description(builder => builder
            .WithName(nameof(GetOrderEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        // No Policies() call — requires authenticated user (default FastEndpoints behavior when
        // not calling AllowAnonymous). Fine-grained access is enforced in HandleAsync.

        Summary(s =>
        {
            s.Summary = "Get order detail";
            s.Description = "Returns full detail for a specific order. Dispatcher: any order in the fleet. " +
                            "Driver: only their assigned orders. Customer: only their own orders. " +
                            "All denials return 404 (no-leak).";
            s.Responses[StatusCodes.Status200OK] = "Order detail with allowed actions.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status404NotFound] = "Order not found or access denied.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(GetOrderRequest req, CancellationToken ct)
    {
        var order = await dbContext.Orders.AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == req.Id, ct);

        if (order is null) { await Send.NotFoundAsync(ct); return; }

        var subClaim = User.FindFirst("sub")?.Value;
        var roleClaim = User.FindFirst("role")?.Value;

        if (!Enum.TryParse<UserRole>(roleClaim, out var role))
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        var isDispatcher = role is UserRole.Dispatcher or UserRole.FleetAdmin;
        var isDriver = role == UserRole.Driver;
        var isCustomer = role == UserRole.Customer;

        bool isAssignedDriver = false;

        if (isDriver)
        {
            // Resolve the driver row to check assignment.
            if (!Guid.TryParse(subClaim, out var driverUserId))
            {
                await Send.NotFoundAsync(ct); return;
            }

            var driverId = await dbContext.Drivers.AsNoTracking()
                .Where(d => d.UserId == driverUserId)
                .Select(d => (Guid?)d.Id)
                .FirstOrDefaultAsync(ct);

            if (driverId is null || order.DriverId != driverId.Value)
            {
                await Send.NotFoundAsync(ct); return;
            }

            isAssignedDriver = true;
        }
        else if (isCustomer)
        {
            // Customer may only see their own order.
            if (!Guid.TryParse(subClaim, out var customerUserId) ||
                order.CustomerUserId != customerUserId)
            {
                await Send.NotFoundAsync(ct); return;
            }
        }
        else if (!isDispatcher)
        {
            // Unknown role.
            await Send.NotFoundAsync(ct); return;
        }

        var allowedActions = OrderStateMachine.AllowedFor(order.Status, role, isAssignedDriver)
            .Select(t => t.ToString().ToLowerInvariant())
            .ToList();

        var detail = new OrderDetailDto(
            order.Id,
            order.PublicCode,
            order.Status.ToString(),
            order.Source.ToString(),
            order.CustomerPhone,
            order.CustomerName,
            order.PickupAddress,
            order.PickupLat,
            order.PickupLng,
            order.DropoffAddress,
            order.DropoffLat,
            order.DropoffLng,
            order.ScheduledAt,
            order.Note,
            order.Passengers,
            order.PriceType.ToString(),
            order.EstimatedPriceCzk,
            order.FixedPriceCzk,
            order.FinalPriceCzk,
            order.PaymentType?.ToString(),
            order.DriverId,
            order.VehicleId,
            order.CreatedAt,
            order.UpdatedAt,
            allowedActions,
            order.Version,
            order.RatingStars,
            order.RatingComment,
            order.RatedAt);

        await Send.OkAsync(new GetOrderResponse(detail), ct);
    }
}
