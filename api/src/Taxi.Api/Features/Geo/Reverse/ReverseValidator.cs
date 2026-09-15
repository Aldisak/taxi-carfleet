using System.Globalization;
using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Geo.Reverse;

/// <summary>Validates the reverse-geocode request — lat/lng must be present, parseable, and within WGS84 range.</summary>
internal sealed class ReverseValidator : Validator<ReverseRequest>
{
    /// <summary>Configures validation rules for <see cref="ReverseRequest"/>.</summary>
    public ReverseValidator()
    {
        RuleFor(x => x.Lat)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Geo.ReverseCoordsInvalid)
            .Must(s => double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) && v >= -90.0 && v <= 90.0)
            .WithErrorCode(ErrorCodes.Geo.ReverseCoordsInvalid);

        RuleFor(x => x.Lng)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Geo.ReverseCoordsInvalid)
            .Must(s => double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) && v >= -180.0 && v <= 180.0)
            .WithErrorCode(ErrorCodes.Geo.ReverseCoordsInvalid);
    }
}
