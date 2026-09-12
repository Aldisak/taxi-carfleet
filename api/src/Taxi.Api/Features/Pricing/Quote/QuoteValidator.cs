using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Pricing.Quote;

/// <summary>Validates the POST /pricing/quote body — pickup coords within WGS84 range; dropoff coords,
/// when present, both supplied and in range.</summary>
internal sealed class QuoteValidator : Validator<QuoteRequest>
{
    /// <summary>Initializes validation rules.</summary>
    public QuoteValidator()
    {
        RuleFor(x => x.PickupLat)
            .InclusiveBetween(-90, 90).WithErrorCode(ErrorCodes.Validation.PickupCoordsOutOfRange);
        RuleFor(x => x.PickupLng)
            .InclusiveBetween(-180, 180).WithErrorCode(ErrorCodes.Validation.PickupCoordsOutOfRange);

        // When a dropoff is supplied, both coords must be present and in range.
        RuleFor(x => x.DropoffLng)
            .NotNull().WithErrorCode(ErrorCodes.Validation.DropoffCoordsRequired)
            .When(x => x.DropoffLat is not null);
        RuleFor(x => x.DropoffLat)
            .NotNull().WithErrorCode(ErrorCodes.Validation.DropoffCoordsRequired)
            .When(x => x.DropoffLng is not null);

        RuleFor(x => x.DropoffLat!.Value)
            .InclusiveBetween(-90, 90).WithErrorCode(ErrorCodes.Validation.DropoffCoordsOutOfRange)
            .When(x => x.DropoffLat is not null);
        RuleFor(x => x.DropoffLng!.Value)
            .InclusiveBetween(-180, 180).WithErrorCode(ErrorCodes.Validation.DropoffCoordsOutOfRange)
            .When(x => x.DropoffLng is not null);
    }
}
