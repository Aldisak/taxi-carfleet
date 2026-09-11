using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Orders.CompleteOrder;

/// <summary>Validates the complete order request.</summary>
internal sealed class CompleteOrderValidator : Validator<CompleteOrderRequest>
{
    /// <summary>Initializes a new instance of <see cref="CompleteOrderValidator"/>.</summary>
    public CompleteOrderValidator()
    {
        RuleFor(x => x.FinalPriceCzk)
            .GreaterThan(0)
            .WithErrorCode(ErrorCodes.Validation.FinalPriceMustBePositive)
            .WithMessage("Final price must be greater than zero.");

        RuleFor(x => x.PaymentType)
            .NotNull()
            .WithErrorCode(ErrorCodes.Validation.PaymentTypeRequired)
            .WithMessage("Payment type is required.");
    }
}
