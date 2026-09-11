using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Auth.RequestCode;

/// <summary>Validates the <c>POST /api/v1/auth/customer/request-code</c> request shape.</summary>
internal sealed class RequestCodeValidator : Validator<RequestCodeRequest>
{
    /// <summary>Initializes validation rules for the request-code request.</summary>
    public RequestCodeValidator()
    {
        RuleFor(x => x.Phone)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.PhoneRequired);

        RuleFor(x => x.Phone)
            .Must(p => PhoneNormalizer.TryNormalize(p, out _))
            .WithErrorCode(ErrorCodes.Validation.PhoneInvalid)
            .When(x => !string.IsNullOrEmpty(x.Phone));
    }
}
