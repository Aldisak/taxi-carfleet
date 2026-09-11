using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Orders.CreateOrder;

/// <summary>Validates the CreateOrder request payload. Checks required fields, coordinate pairs,
/// phone format, passenger count, and price type consistency.</summary>
internal sealed class CreateOrderValidator : Validator<CreateOrderRequest>
{
    /// <summary>Initializes a new instance of <see cref="CreateOrderValidator"/>.</summary>
    public CreateOrderValidator()
    {
        RuleFor(x => x.PickupAddress)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.PickupAddressRequired);

        // Pickup coordinates: non-zero values indicate they were supplied.
        RuleFor(x => x.PickupLat)
            .NotEqual(0.0)
            .WithErrorCode(ErrorCodes.Validation.PickupCoordsRequired)
            .WithMessage("Pickup latitude must be provided (non-zero).");

        RuleFor(x => x.PickupLng)
            .NotEqual(0.0)
            .WithErrorCode(ErrorCodes.Validation.PickupCoordsRequired)
            .WithMessage("Pickup longitude must be provided (non-zero).");

        // Dropoff: if address provided, coords required.
        RuleFor(x => x.DropoffLat)
            .NotNull()
            .WithErrorCode(ErrorCodes.Validation.DropoffCoordsRequired)
            .When(x => x.DropoffAddress is not null);

        RuleFor(x => x.DropoffLng)
            .NotNull()
            .WithErrorCode(ErrorCodes.Validation.DropoffCoordsRequired)
            .When(x => x.DropoffAddress is not null);

        // Phone: if provided, must be E.164-normalizable.
        RuleFor(x => x.CustomerPhone)
            .Must(phone => PhoneNormalizer.TryNormalize(phone, out _))
            .WithErrorCode(ErrorCodes.Validation.PhoneInvalid)
            .When(x => x.CustomerPhone is not null);

        RuleFor(x => x.Passengers)
            .GreaterThanOrEqualTo(1)
            .WithErrorCode(ErrorCodes.Validation.PassengersMinOne);

        // Fixed price consistency.
        RuleFor(x => x.FixedPriceCzk)
            .NotNull()
            .WithErrorCode(ErrorCodes.Validation.FixedPriceCzkRequired)
            .When(x => x.PriceType == PriceType.Fixed);

        RuleFor(x => x.FixedPriceCzk)
            .Null()
            .WithErrorCode(ErrorCodes.Validation.FixedPriceCzkNotAllowed)
            .When(x => x.PriceType != PriceType.Fixed);

        // ScheduledAt future check is intentionally NOT here — it requires TimeProvider.
        // The endpoint performs this domain-state check and returns 400 via AddError + ErrorsAsync.
    }
}
