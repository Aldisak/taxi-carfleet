using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Orders.UpdateOrder;

/// <summary>Validates PATCH /orders/{id} — dropoff address requires coordinates, version is required.</summary>
internal sealed class UpdateOrderValidator : Validator<UpdateOrderRequest>
{
    /// <summary>Initializes validation rules.</summary>
    public UpdateOrderValidator()
    {
        // Version is required for optimistic concurrency check.
        RuleFor(x => x.Version)
            .NotNull()
            .WithErrorCode(ErrorCodes.Validation.VersionRequired);

        // When dropoff address is provided, coordinates must also be provided.
        RuleFor(x => x.DropoffLat)
            .NotNull()
            .When(x => !string.IsNullOrEmpty(x.DropoffAddress))
            .WithErrorCode(ErrorCodes.Validation.DropoffCoordsRequired);

        RuleFor(x => x.DropoffLng)
            .NotNull()
            .When(x => !string.IsNullOrEmpty(x.DropoffAddress))
            .WithErrorCode(ErrorCodes.Validation.DropoffCoordsRequired);

        // When pickup address is provided, coordinates must also be provided.
        RuleFor(x => x.PickupLat)
            .NotNull()
            .When(x => !string.IsNullOrEmpty(x.PickupAddress))
            .WithErrorCode(ErrorCodes.Validation.PickupCoordsRequired);

        RuleFor(x => x.PickupLng)
            .NotNull()
            .When(x => !string.IsNullOrEmpty(x.PickupAddress))
            .WithErrorCode(ErrorCodes.Validation.PickupCoordsRequired);

        // If passengers is provided, it must be positive.
        RuleFor(x => x.Passengers)
            .GreaterThan(0)
            .When(x => x.Passengers.HasValue)
            .WithErrorCode(ErrorCodes.Validation.PassengersMinOne);
    }
}
