using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Orders.GetOrder;
using Taxi.Api.Features.Orders.Shared;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using OrderEntity = Taxi.Api.Infrastructure.Entities.Order;

namespace Taxi.Api.Features.Orders.CreateOrder;

/// <summary>Creates a new taxi order. Accepts requests from both Dispatchers and Customers.</summary>
internal sealed class CreateOrderEndpoint(
    TaxiDbContext dbContext,
    ICurrentTenant currentTenant,
    TimeProvider timeProvider)
    : Endpoint<CreateOrderRequest, CreateOrderResponse>
{
    private const int MaxPublicCodeRetries = 5;

    private readonly OrdersFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("orders");
        Description(builder => builder
            .WithName(nameof(CreateOrderEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DispatcherOrCustomer));

        Summary(s =>
        {
            s.Summary = "Create a new order";
            s.Description = "Creates a taxi order in New status with a Created event. " +
                            "Dispatcher callers must supply a customer phone. " +
                            "Customer callers may omit the phone (defaults to their profile phone).";
            s.Responses[StatusCodes.Status201Created] = "Order created successfully.";
            s.Responses[StatusCodes.Status400BadRequest] = "Validation failed (coords missing, invalid phone, past scheduledAt, no tenant).";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not authorized (wrong role).";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CreateOrderRequest req, CancellationToken ct)
    {
        // Guard: tenant must be resolved.
        if (currentTenant.FleetId is not Guid fleetId)
        {
            AddError("No fleet resolved for this request. Customer requests require an X-Fleet-Slug header or a fleet_id JWT claim.",
                ErrorCodes.Validation.NoTenantResolved);
            await Send.ErrorsAsync(400, ct);
            return;
        }

        var now = timeProvider.GetUtcNow();
        var subClaim = User.FindFirst("sub")?.Value;
        var roleClaim = User.FindFirst("role")?.Value;
        var isCustomer = roleClaim == nameof(UserRole.Customer);

        // Guard: scheduledAt must be in the future.
        if (req.ScheduledAt.HasValue && req.ScheduledAt.Value <= now)
        {
            AddError(r => r.ScheduledAt, "scheduledAt must be in the future.",
                ErrorCodes.Validation.ScheduledAtMustBeFuture);
            await Send.ErrorsAsync(400, ct);
            return;
        }

        // Resolve customer phone.
        string? customerPhone;
        Guid? customerUserId = null;

        if (isCustomer)
        {
            // Customer caller: default to their own profile phone if not provided.
            if (!Guid.TryParse(subClaim, out var customerUserIdParsed))
            {
                AddError("Invalid customer identity — the sub claim could not be parsed as a Guid.",
                    ErrorCodes.Validation.InvalidCustomerIdentity);
                await Send.ErrorsAsync(400, ct);
                return;
            }

            customerUserId = customerUserIdParsed;

            if (req.CustomerPhone is not null)
            {
                if (!PhoneNormalizer.TryNormalize(req.CustomerPhone, out var normalizedReqPhone) || normalizedReqPhone is null)
                {
                    AddError(r => r.CustomerPhone, "Phone number is not a valid E.164 or normalizable Czech number.",
                        ErrorCodes.Validation.PhoneInvalid);
                    await Send.ErrorsAsync(400, ct);
                    return;
                }

                customerPhone = normalizedReqPhone;
            }
            else
            {
                // Load their profile phone.
                var user = await dbContext.Users.IgnoreQueryFilters()
                    .AsNoTracking()
                    .Where(u => u.Id == customerUserIdParsed)
                    .Select(u => u.Phone)
                    .FirstOrDefaultAsync(ct);

                if (user is null)
                {
                    AddError("Customer user record not found.",
                        ErrorCodes.Validation.InvalidCustomerIdentity);
                    await Send.ErrorsAsync(400, ct);
                    return;
                }

                customerPhone = user;
            }
        }
        else
        {
            // Dispatcher caller: phone is required and was validated by the validator.
            if (string.IsNullOrWhiteSpace(req.CustomerPhone))
            {
                AddError(r => r.CustomerPhone, "Phone number is required for Dispatcher orders.",
                    ErrorCodes.Validation.PhoneRequired);
                await Send.ErrorsAsync(400, ct);
                return;
            }

            if (!PhoneNormalizer.TryNormalize(req.CustomerPhone, out var normalizedPhone) || normalizedPhone is null)
            {
                AddError(r => r.CustomerPhone, "Phone number is not a valid E.164 or normalizable Czech number.",
                    ErrorCodes.Validation.PhoneInvalid);
                await Send.ErrorsAsync(400, ct);
                return;
            }

            customerPhone = normalizedPhone;
        }

        // Look up the CreatedByUserId (the authenticated user creating this order).
        Guid? createdByUserId = Guid.TryParse(subClaim, out var callerUserId) ? callerUserId : null;

        // Generate a per-fleet-unique 6-char public code (retry loop on unique violation).
        var order = new OrderEntity
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = PublicCodeGenerator.Generate(),
            Status = OrderStatus.New,
            Source = isCustomer ? OrderSource.App : OrderSource.Dispatcher,
            CustomerUserId = isCustomer ? customerUserId : null,
            CustomerPhone = customerPhone,
            CustomerName = req.CustomerName,
            PickupAddress = req.PickupAddress,
            PickupLat = req.PickupLat,
            PickupLng = req.PickupLng,
            DropoffAddress = req.DropoffAddress,
            DropoffLat = req.DropoffLat,
            DropoffLng = req.DropoffLng,
            ScheduledAt = req.ScheduledAt,
            Note = req.Note,
            Passengers = req.Passengers,
            PriceType = req.PriceType,
            EstimatedPriceCzk = req.EstimatedPriceCzk,
            FixedPriceCzk = req.FixedPriceCzk,
            RouteId = req.RouteId,
            CreatedByUserId = createdByUserId,
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1
        };

        var createdEvent = new OrderEvent
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            OrderId = order.Id,
            Type = OrderEventType.Created,
            FromStatus = OrderStatus.New,
            ToStatus = OrderStatus.New,
            ActorUserId = createdByUserId,
            ActorRole = isCustomer ? UserRole.Customer : UserRole.Dispatcher,
            At = now
        };

        dbContext.Orders.Add(order);
        dbContext.OrderEvents.Add(createdEvent);

        // Retry loop for public code uniqueness (up to MaxPublicCodeRetries).
        for (var attempt = 0; attempt < MaxPublicCodeRetries; attempt++)
        {
            try
            {
                await dbContext.SaveChangesAsync(ct);
                break; // success — exit retry loop
            }
            catch (DbUpdateException ex)
                when (attempt < MaxPublicCodeRetries - 1 && IsUniqueViolation(ex))
            {
                // Regenerate public code on unique constraint violation and retry.
                order.PublicCode = PublicCodeGenerator.Generate();
                dbContext.Entry(order).Property(o => o.PublicCode).IsModified = true;
            }
        }

        var allowedActions = OrderStateMachine.AllowedFor(order.Status,
                isCustomer ? UserRole.Customer : UserRole.Dispatcher,
                isAssignedDriver: false)
            .Select(t => t.ToString().ToLowerInvariant())
            .ToList();

        var detail = ToDetailDto(order, allowedActions);

        await Send.CreatedAtAsync<GetOrderEndpoint>(
            new { id = order.Id },
            new CreateOrderResponse(detail),
            generateAbsoluteUrl: false,
            cancellation: ct);
    }

    private static bool IsUniqueViolation(DbUpdateException ex)
    {
        var inner = ex.InnerException;
        return inner is Npgsql.PostgresException pe && pe.SqlState == "23505";
    }

    private static OrderDetailDto ToDetailDto(OrderEntity order, IReadOnlyList<string> allowedActions)
        => new(
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
            order.Version);
}
