using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Auth.Refresh;

/// <summary>Validates the <c>POST /api/v1/auth/refresh</c> request shape.</summary>
internal sealed class RefreshValidator : Validator<RefreshRequest>
{
    /// <summary>Initializes validation rules for the refresh request.</summary>
    public RefreshValidator()
    {
        RuleFor(x => x.RefreshToken)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.RefreshTokenRequired);
    }
}
