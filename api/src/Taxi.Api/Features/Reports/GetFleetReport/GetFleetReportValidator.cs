using System.Globalization;
using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Reports.GetFleetReport;

/// <summary>Validates <see cref="GetFleetReportRequest"/>: well-formed dates and a non-inverted range.</summary>
internal sealed class GetFleetReportValidator : Validator<GetFleetReportRequest>
{
    /// <summary>Initializes validation rules for <see cref="GetFleetReportRequest"/>.</summary>
    public GetFleetReportValidator()
    {
        RuleFor(x => x.From).NotEmpty().WithErrorCode(ErrorCodes.Validation.FromDateRequired);
        RuleFor(x => x.To).NotEmpty().WithErrorCode(ErrorCodes.Validation.ToDateRequired);

        RuleFor(x => x.From)
            .Must(BeValidDate).WithErrorCode(ErrorCodes.Validation.InvalidDateFormat)
            .When(x => !string.IsNullOrEmpty(x.From));
        RuleFor(x => x.To)
            .Must(BeValidDate).WithErrorCode(ErrorCodes.Validation.InvalidDateFormat)
            .When(x => !string.IsNullOrEmpty(x.To));

        RuleFor(x => x)
            .Must(x => ToOnOrAfterFrom(x.From!, x.To!))
            .WithErrorCode(ErrorCodes.Validation.ToBeforeFrom)
            .When(x => BeValidDate(x.From) && BeValidDate(x.To));
    }

    private static bool BeValidDate(string? value) =>
        value is not null
        && DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    private static bool ToOnOrAfterFrom(string from, string to) =>
        DateOnly.ParseExact(to, "yyyy-MM-dd", CultureInfo.InvariantCulture)
        >= DateOnly.ParseExact(from, "yyyy-MM-dd", CultureInfo.InvariantCulture);
}
