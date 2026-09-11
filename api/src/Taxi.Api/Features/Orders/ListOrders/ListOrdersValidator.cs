using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Orders.ListOrders;

/// <summary>Validates list-orders query parameters.</summary>
internal sealed class ListOrdersValidator : Validator<ListOrdersRequest>
{
    /// <summary>Initializes a new instance of <see cref="ListOrdersValidator"/>.</summary>
    public ListOrdersValidator()
    {
        RuleFor(x => x.Page)
            .GreaterThanOrEqualTo(1)
            .WithErrorCode(ErrorCodes.Validation.PageMinOne);

        RuleFor(x => x.PageSize)
            .GreaterThanOrEqualTo(1)
            .LessThanOrEqualTo(200)
            .WithErrorCode(ErrorCodes.Validation.PageSizeRange);
    }
}
