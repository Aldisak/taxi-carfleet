using System.Globalization;
using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Audit.GetAudit;

/// <summary>Validates <see cref="GetAuditRequest"/>: paging bounds and optional well-formed dates.</summary>
internal sealed class GetAuditValidator : Validator<GetAuditRequest>
{
    /// <summary>Initializes validation rules for <see cref="GetAuditRequest"/>.</summary>
    public GetAuditValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1).WithErrorCode(ErrorCodes.Validation.PageMinOne);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200).WithErrorCode(ErrorCodes.Validation.PageSizeRange);

        RuleFor(x => x.From)
            .Must(BeValidDate).WithErrorCode(ErrorCodes.Validation.InvalidDateFormat)
            .When(x => !string.IsNullOrEmpty(x.From));
        RuleFor(x => x.To)
            .Must(BeValidDate).WithErrorCode(ErrorCodes.Validation.InvalidDateFormat)
            .When(x => !string.IsNullOrEmpty(x.To));
    }

    private static bool BeValidDate(string? value) =>
        value is not null
        && DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
}
