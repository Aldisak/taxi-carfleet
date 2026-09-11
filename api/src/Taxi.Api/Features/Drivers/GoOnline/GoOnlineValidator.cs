using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Drivers.GoOnline;

/// <summary>Validates the <see cref="GoOnlineRequest"/> — ensures VehicleId is provided.</summary>
internal sealed class GoOnlineValidator : Validator<GoOnlineRequest>
{
    /// <summary>Configures validation rules for the go-online request.</summary>
    public GoOnlineValidator()
    {
        RuleFor(x => x.VehicleId)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.VehicleIdRequired);
    }
}
