using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Drivers.OverrideStatus;

/// <summary>Validates the driver status override request. Rejects EnRoute which cannot be set manually.</summary>
internal sealed class OverrideStatusValidator : Validator<OverrideStatusRequest>
{
    /// <summary>Initializes the validator with the allowed status rule.</summary>
    public OverrideStatusValidator()
    {
        RuleFor(x => x.Status)
            .Must(s => s is DriverStatus.Free or DriverStatus.Busy or DriverStatus.Offline)
            .WithErrorCode(ErrorCodes.DriverOverride.InvalidOverrideStatus)
            .WithMessage("Override status must be Free, Busy, or Offline. EnRoute cannot be set manually.");
    }
}
