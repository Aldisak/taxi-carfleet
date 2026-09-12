using System.Globalization;
using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Drivers.GetMySummary;

/// <summary>Validates <see cref="GetMySummaryRequest"/>. Only validates when <c>date</c> is non-null.</summary>
internal sealed class GetMySummaryValidator : Validator<GetMySummaryRequest>
{
    /// <summary>Initializes validation rules for <see cref="GetMySummaryRequest"/>.</summary>
    public GetMySummaryValidator()
    {
        // A non-null date must be a valid yyyy-MM-dd string (InvariantCulture).
        RuleFor(x => x.Date)
            .Must(d => d is null || DateOnly.TryParseExact(d, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            .WithErrorCode(ErrorCodes.Validation.InvalidDateFormat)
            .When(x => x.Date is not null);
    }
}
