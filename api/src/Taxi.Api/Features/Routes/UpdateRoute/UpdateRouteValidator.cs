using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Routes.UpdateRoute;

/// <summary>Validates the update route request with per-type field rules.</summary>
internal sealed class UpdateRouteValidator : Validator<UpdateRouteRequest>
{
    /// <summary>Initializes the validation rules.</summary>
    public UpdateRouteValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.RouteNameRequired);

        RuleFor(x => x.PriceCzk)
            .GreaterThanOrEqualTo(0).WithErrorCode(ErrorCodes.Validation.RoutePriceNonNegative);

        RuleFor(x => x.Type)
            .Must(t => RouteTypeValidation.ParseType(t) is not null)
            .WithErrorCode(ErrorCodes.Validation.RouteNameRequired)
            .WithMessage("Type must be PointToPoint, Zone, or ZoneToZone.");

        RuleFor(x => x)
            .Must(x => RouteTypeValidation.IsValidPointToPoint(x.ToLat, x.ToLng, x.FromRadiusMeters, x.ToRadiusMeters))
            .When(x => RouteTypeValidation.ParseType(x.Type) == RouteType.PointToPoint)
            .WithErrorCode(ErrorCodes.Validation.RoutePointToPointInvalid)
            .WithMessage("A PointToPoint route requires from/to coordinates and positive radii.");

        RuleFor(x => x)
            .Must(x => RouteTypeValidation.IsValidZone(x.FromZoneId, x.ToZoneId))
            .When(x => RouteTypeValidation.ParseType(x.Type) == RouteType.Zone)
            .WithErrorCode(ErrorCodes.Validation.RouteZoneInvalid)
            .WithMessage("A Zone route requires a from-zone and no to-zone.");

        RuleFor(x => x)
            .Must(x => RouteTypeValidation.IsValidZoneToZone(x.FromZoneId, x.ToZoneId))
            .When(x => RouteTypeValidation.ParseType(x.Type) == RouteType.ZoneToZone)
            .WithErrorCode(ErrorCodes.Validation.RouteZoneToZoneInvalid)
            .WithMessage("A ZoneToZone route requires both a from-zone and a to-zone.");
    }
}
