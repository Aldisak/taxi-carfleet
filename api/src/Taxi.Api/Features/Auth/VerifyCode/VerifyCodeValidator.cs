using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Auth.VerifyCode;

/// <summary>Validates the <c>POST /api/v1/auth/customer/verify-code</c> request shape.</summary>
internal sealed class VerifyCodeValidator : Validator<VerifyCodeRequest>
{
    /// <summary>Initializes validation rules for the verify-code request.</summary>
    public VerifyCodeValidator()
    {
        RuleFor(x => x.Phone)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.PhoneRequired);

        RuleFor(x => x.Phone)
            .Must(p => PhoneNormalizer.TryNormalize(p, out _))
            .WithErrorCode(ErrorCodes.Validation.PhoneInvalid)
            .When(x => !string.IsNullOrEmpty(x.Phone));

        RuleFor(x => x.Code)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.CodeRequired);

        RuleFor(x => x.Code)
            .Matches(@"^\d{6}$")
            .WithErrorCode(ErrorCodes.Validation.CodeInvalid)
            .When(x => !string.IsNullOrEmpty(x.Code));
    }
}
