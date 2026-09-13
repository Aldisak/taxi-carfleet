using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Auth.AdminLogin;

/// <summary>Validates the <c>POST /api/v1/auth/admin/login</c> request shape.</summary>
internal sealed class AdminLoginValidator : Validator<AdminLoginRequest>
{
    /// <summary>Initializes validation rules for the admin login request.</summary>
    public AdminLoginValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.EmailRequired);

        RuleFor(x => x.Email)
            .EmailAddress()
            .WithErrorCode(ErrorCodes.Validation.EmailInvalid)
            .When(x => !string.IsNullOrEmpty(x.Email));

        RuleFor(x => x.Password)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.PasswordRequired);
    }
}
