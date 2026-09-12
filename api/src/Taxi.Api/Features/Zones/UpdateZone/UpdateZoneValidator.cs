using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;
using Taxi.Api.Features.Zones.CreateZone;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Zones.UpdateZone;

/// <summary>Validates the update zone request per shape: Circle requires a positive radius and no
/// polygon; Polygon requires 3..200 coordinate pairs and no radius.</summary>
internal sealed class UpdateZoneValidator : Validator<UpdateZoneRequest>
{
    /// <summary>Initializes the validation rules.</summary>
    public UpdateZoneValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.ZoneNameRequired);

        RuleFor(x => x)
            .Must(x => x is { RadiusMeters: > 0, Polygon: null })
            .When(x => CreateZoneValidator.IsCircle(x.Shape))
            .WithErrorCode(ErrorCodes.Validation.ZoneCircleInvalid)
            .WithMessage("A Circle zone requires a positive radius and no polygon.");

        RuleFor(x => x)
            .Must(x => x.RadiusMeters is null
                       && x.Polygon is { Length: >= 3 and <= 200 }
                       && x.Polygon.All(p => p.Length >= 2))
            .When(x => CreateZoneValidator.IsPolygon(x.Shape))
            .WithErrorCode(ErrorCodes.Validation.ZonePolygonInvalid)
            .WithMessage("A Polygon zone requires 3..200 coordinate pairs and no radius.");

        RuleFor(x => x.Shape)
            .Must(s => CreateZoneValidator.IsCircle(s) || CreateZoneValidator.IsPolygon(s))
            .WithErrorCode(ErrorCodes.Validation.ZoneNameRequired)
            .WithMessage("Shape must be Circle or Polygon.");
    }
}
