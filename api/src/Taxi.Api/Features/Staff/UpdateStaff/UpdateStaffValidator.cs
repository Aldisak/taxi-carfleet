using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Staff.UpdateStaff;

/// <summary>Validates the update staff request — display name is required.</summary>
internal sealed class UpdateStaffValidator : Validator<UpdateStaffRequest>
{
    /// <summary>Initializes the validation rules.</summary>
    public UpdateStaffValidator()
    {
        RuleFor(x => x.DisplayName)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.DisplayNameRequired);
    }
}
