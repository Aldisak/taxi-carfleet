using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Zones.CreateZone;

/// <summary>Validates the create zone request per shape: Circle requires a positive radius and no
/// polygon; Polygon requires 3..200 coordinate pairs and no radius.</summary>
internal sealed class CreateZoneValidator : Validator<CreateZoneRequest>
{
    /// <summary>Initializes the validation rules.</summary>
    public CreateZoneValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.ZoneNameRequired);

        RuleFor(x => x)
            .Must(BeValidCircle)
            .When(x => IsCircle(x.Shape))
            .WithErrorCode(ErrorCodes.Validation.ZoneCircleInvalid)
            .WithMessage("A Circle zone requires a positive radius and no polygon.");

        RuleFor(x => x)
            .Must(BeValidPolygon)
            .When(x => IsPolygon(x.Shape))
            .WithErrorCode(ErrorCodes.Validation.ZonePolygonInvalid)
            .WithMessage("A Polygon zone requires 3..200 coordinate pairs and no radius.");

        RuleFor(x => x.Shape)
            .Must(s => IsCircle(s) || IsPolygon(s))
            .WithErrorCode(ErrorCodes.Validation.ZoneNameRequired)
            .WithMessage("Shape must be Circle or Polygon.");
    }

    internal static bool IsCircle(string shape) =>
        string.Equals(shape, nameof(ZoneShape.Circle), StringComparison.OrdinalIgnoreCase);

    internal static bool IsPolygon(string shape) =>
        string.Equals(shape, nameof(ZoneShape.Polygon), StringComparison.OrdinalIgnoreCase);

    internal static bool BeValidCircle(CreateZoneRequest x) =>
        x is { RadiusMeters: > 0, Polygon: null };

    internal static bool BeValidPolygon(CreateZoneRequest x) =>
        x.RadiusMeters is null
        && x.Polygon is { Length: >= 3 and <= 200 }
        && x.Polygon.All(p => p.Length >= 2);
}
