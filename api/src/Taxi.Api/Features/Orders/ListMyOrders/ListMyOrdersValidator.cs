using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Orders.ListMyOrders;

/// <summary>Validates <see cref="ListMyOrdersRequest"/> — bounds page and page size.</summary>
internal sealed class ListMyOrdersValidator : Validator<ListMyOrdersRequest>
{
    /// <summary>Initializes validation rules for <see cref="ListMyOrdersRequest"/>.</summary>
    public ListMyOrdersValidator()
    {
        RuleFor(x => x.Page)
            .GreaterThanOrEqualTo(1)
            .WithErrorCode(ErrorCodes.Validation.PageMinOne);

        RuleFor(x => x.PageSize)
            .InclusiveBetween(1, 200)
            .WithErrorCode(ErrorCodes.Validation.PageSizeRange);
    }
}
