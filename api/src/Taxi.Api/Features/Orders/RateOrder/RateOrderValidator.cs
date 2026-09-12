using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Orders.RateOrder;

/// <summary>Validates the rating request — stars in 1..5, comment length &lt;= 500.</summary>
internal sealed class RateOrderValidator : Validator<RateOrderRequest>
{
    /// <summary>Configures validation rules for <see cref="RateOrderRequest"/>.</summary>
    public RateOrderValidator()
    {
        RuleFor(x => x.Stars)
            .InclusiveBetween(1, 5)
            .WithErrorCode(ErrorCodes.Validation.RatingStarsRange);

        RuleFor(x => x.Comment)
            .MaximumLength(500)
            .WithErrorCode(ErrorCodes.Validation.RatingCommentTooLong)
            .When(x => x.Comment is not null);
    }
}
