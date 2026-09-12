using System.Globalization;
using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Geo.Route;

/// <summary>Validates the GET /geo/route request — all coordinates must be provided and parseable.</summary>
internal sealed class RouteValidator : Validator<RouteRequest>
{
    /// <summary>Initializes validation rules.</summary>
    public RouteValidator()
    {
        RuleFor(x => x.FromLat)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.PickupCoordsRequired)
            .Must(s => double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out _))
            .When(x => !string.IsNullOrEmpty(x.FromLat))
            .WithErrorCode(ErrorCodes.Validation.PickupCoordsRequired);

        RuleFor(x => x.FromLng)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.PickupCoordsRequired)
            .Must(s => double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out _))
            .When(x => !string.IsNullOrEmpty(x.FromLng))
            .WithErrorCode(ErrorCodes.Validation.PickupCoordsRequired);

        RuleFor(x => x.ToLat)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.DropoffCoordsRequired)
            .Must(s => double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out _))
            .When(x => !string.IsNullOrEmpty(x.ToLat))
            .WithErrorCode(ErrorCodes.Validation.DropoffCoordsRequired);

        RuleFor(x => x.ToLng)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.DropoffCoordsRequired)
            .Must(s => double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out _))
            .When(x => !string.IsNullOrEmpty(x.ToLng))
            .WithErrorCode(ErrorCodes.Validation.DropoffCoordsRequired);
    }
}
