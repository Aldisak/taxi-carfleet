using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Places.UpdatePlace;

/// <summary>Validates the update place request — name and address required, sort order non-negative.</summary>
internal sealed class UpdatePlaceValidator : Validator<UpdatePlaceRequest>
{
    /// <summary>Initializes the validation rules.</summary>
    public UpdatePlaceValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.PlaceNameRequired);

        RuleFor(x => x.Address)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.PlaceAddressRequired);

        RuleFor(x => x.SortOrder)
            .GreaterThanOrEqualTo(0).WithErrorCode(ErrorCodes.Validation.SortOrderNonNegative);
    }
}
