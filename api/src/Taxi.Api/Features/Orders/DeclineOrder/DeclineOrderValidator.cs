using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Orders.DeclineOrder;

/// <summary>Validates the decline order request — reason must not be empty.</summary>
internal sealed class DeclineOrderValidator : Validator<DeclineOrderRequest>
{
    /// <summary>Initializes a new instance of <see cref="DeclineOrderValidator"/>.</summary>
    public DeclineOrderValidator()
    {
        RuleFor(x => x.Reason)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.ReasonRequired)
            .WithMessage("A reason for declining the order is required.");
    }
}
