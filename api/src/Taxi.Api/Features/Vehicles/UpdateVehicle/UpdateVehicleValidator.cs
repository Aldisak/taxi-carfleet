using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Vehicles.UpdateVehicle;

/// <summary>Validates the update vehicle request — checks required fields and ranges.</summary>
internal sealed class UpdateVehicleValidator : Validator<UpdateVehicleRequest>
{
    /// <summary>Initializes the validation rules.</summary>
    public UpdateVehicleValidator()
    {
        RuleFor(x => x.Plate)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.PlateRequired)
            .MaximumLength(20)
            .WithErrorCode(ErrorCodes.Validation.PlateTooLong);

        RuleFor(x => x.Make)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.MakeRequired);

        RuleFor(x => x.Model)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.ModelRequired);

        RuleFor(x => x.Color)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.ColorRequired);

        RuleFor(x => x.Seats)
            .GreaterThanOrEqualTo(1)
            .WithErrorCode(ErrorCodes.Validation.SeatsMinOne);
    }
}
