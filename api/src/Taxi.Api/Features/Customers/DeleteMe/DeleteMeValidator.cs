using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Customers.DeleteMe;

/// <summary>Validates <see cref="DeleteMeRequest"/>: the confirmation code must be present (6 digits).</summary>
internal sealed class DeleteMeValidator : Validator<DeleteMeRequest>
{
    /// <summary>Initializes validation rules for <see cref="DeleteMeRequest"/>.</summary>
    public DeleteMeValidator()
    {
        RuleFor(x => x.Code)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.CodeRequired)
            .Matches("^[0-9]{6}$").WithErrorCode(ErrorCodes.Validation.CodeInvalid);
    }
}
