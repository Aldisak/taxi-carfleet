using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Geo.Geocode;

/// <summary>Validates the geocode request — query must be at least 3 characters.</summary>
internal sealed class GeocodeValidator : Validator<GeocodeRequest>
{
    /// <summary>Configures the validation rules for <see cref="GeocodeRequest"/>.</summary>
    public GeocodeValidator()
    {
        RuleFor(x => x.Q)
            .MinimumLength(3)
            .WithErrorCode(ErrorCodes.Geo.GeocodeQueryTooShort);
    }
}
