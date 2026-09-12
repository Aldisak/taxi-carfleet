using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Places.CreatePlace;

/// <summary>Validates the create place request — name and address required, sort order non-negative.</summary>
internal sealed class CreatePlaceValidator : Validator<CreatePlaceRequest>
{
    /// <summary>Initializes the validation rules.</summary>
    public CreatePlaceValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.PlaceNameRequired);

        RuleFor(x => x.Address)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.PlaceAddressRequired);

        RuleFor(x => x.SortOrder)
            .GreaterThanOrEqualTo(0).WithErrorCode(ErrorCodes.Validation.SortOrderNonNegative);
    }
}
