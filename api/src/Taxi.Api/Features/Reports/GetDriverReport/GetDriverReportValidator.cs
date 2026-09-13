using System.Globalization;
using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Reports.GetDriverReport;

/// <summary>Validates <see cref="GetDriverReportRequest"/>: required driver id, well-formed dates,
/// and a non-inverted range.</summary>
internal sealed class GetDriverReportValidator : Validator<GetDriverReportRequest>
{
    /// <summary>Initializes validation rules for <see cref="GetDriverReportRequest"/>.</summary>
    public GetDriverReportValidator()
    {
        RuleFor(x => x.DriverId).NotEmpty().WithErrorCode(ErrorCodes.Validation.DriverIdRequired);

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
