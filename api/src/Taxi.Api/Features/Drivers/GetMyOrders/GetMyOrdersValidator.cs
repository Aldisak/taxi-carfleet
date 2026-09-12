using System.Globalization;
using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Drivers.GetMyOrders;

/// <summary>Validates <see cref="GetMyOrdersRequest"/>. Only validates when <c>date</c> is non-null.</summary>
internal sealed class GetMyOrdersValidator : Validator<GetMyOrdersRequest>
{
    /// <summary>Initializes validation rules for <see cref="GetMyOrdersRequest"/>.</summary>
    public GetMyOrdersValidator()
    {
        RuleFor(x => x.Date)
            .Must(d => d is null || DateOnly.TryParseExact(d, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            .WithErrorCode(ErrorCodes.Validation.InvalidDateFormat)
            .When(x => x.Date is not null);
    }
}
