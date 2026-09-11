using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Auth.StaffLogin;

/// <summary>Validates the <c>POST /api/v1/auth/staff/login</c> request shape.</summary>
internal sealed class StaffLoginValidator : Validator<StaffLoginRequest>
{
    /// <summary>Initializes validation rules for the staff login request.</summary>
    public StaffLoginValidator()
    {
        RuleFor(x => x.FleetSlug)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.FleetSlugRequired);

        RuleFor(x => x.Email)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.EmailRequired);

        RuleFor(x => x.Password)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.PasswordRequired);
    }
}
