using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Orders.CancelOrder;

/// <summary>Validates the cancel order request — reason must not be empty.</summary>
internal sealed class CancelOrderValidator : Validator<CancelOrderRequest>
{
    /// <summary>Initializes a new instance of <see cref="CancelOrderValidator"/>.</summary>
    public CancelOrderValidator()
    {
        RuleFor(x => x.Reason)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.ReasonRequired)
            .WithMessage("A reason for cancelling the order is required.");
    }
}
