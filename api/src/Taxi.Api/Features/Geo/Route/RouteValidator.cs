using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Geo.Route;

/// <summary>Validates the POST /geo/route request body — From and To must be provided with valid WGS84 ranges.
/// Null-island (0,0) is rejected to avoid routing from/to the ocean off the coast of Africa.</summary>
internal sealed class RouteValidator : Validator<RouteRequest>
{
    /// <summary>Initializes validation rules for the route request body.</summary>
    public RouteValidator()
    {
        // From must be provided.
        RuleFor(x => x.From)
            .NotNull().WithErrorCode(ErrorCodes.Validation.PickupCoordsRequired);

        // From.Lat must be within WGS84 range.
        When(x => x.From is not null, () =>
        {
            RuleFor(x => x.From!.Lat)
                .InclusiveBetween(-90.0, 90.0)
                .WithErrorCode(ErrorCodes.Validation.PickupCoordsOutOfRange);

            RuleFor(x => x.From!.Lng)
                .InclusiveBetween(-180.0, 180.0)
                .WithErrorCode(ErrorCodes.Validation.PickupCoordsOutOfRange);

            // Reject null-island (0,0) — default double values indicate a missing/unset coordinate.
            RuleFor(x => x.From!)
                .Must(p => p.Lat != 0.0 || p.Lng != 0.0)
                .WithErrorCode(ErrorCodes.Validation.PickupCoordsOutOfRange)
                .WithMessage("Pickup coordinates (0,0) are not valid — null-island rejected.");
        });

        // To must be provided.
        RuleFor(x => x.To)
            .NotNull().WithErrorCode(ErrorCodes.Validation.DropoffCoordsRequired);

        // To.Lat/Lng must be within WGS84 range.
        When(x => x.To is not null, () =>
        {
            RuleFor(x => x.To!.Lat)
                .InclusiveBetween(-90.0, 90.0)
                .WithErrorCode(ErrorCodes.Validation.DropoffCoordsOutOfRange);

            RuleFor(x => x.To!.Lng)
                .InclusiveBetween(-180.0, 180.0)
                .WithErrorCode(ErrorCodes.Validation.DropoffCoordsOutOfRange);
        });
    }
}
