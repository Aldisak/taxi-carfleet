using System.Globalization;
using FastEndpoints;
using FluentValidation;

namespace Taxi.Api.Features.Analytics.Shared;

/// <summary>Validates shared analytics range parameters (from/to dates, granularity) for all analytics endpoints.</summary>
internal sealed class AnalyticsRangeValidator : Validator<AnalyticsRangeRequest>
{
    private static readonly HashSet<string> ValidGranularities =
        new(StringComparer.OrdinalIgnoreCase) { "day", "week", "month" };

    /// <summary>Initialises validation rules.</summary>
    public AnalyticsRangeValidator()
    {
        RuleFor(x => x.From)
            .Must(s => s is null || DateOnly.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out _))
            .WithErrorCode("Analytics.InvalidFrom")
            .WithMessage("'from' must be a valid date in yyyy-MM-dd format.");

        RuleFor(x => x.To)
            .Must(s => s is null || DateOnly.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out _))
            .WithErrorCode("Analytics.InvalidTo")
            .WithMessage("'to' must be a valid date in yyyy-MM-dd format.");

        RuleFor(x => x.Granularity)
            .Must(s => s is null || ValidGranularities.Contains(s))
            .WithErrorCode("Analytics.InvalidGranularity")
            .WithMessage("'granularity' must be one of: day, week, month.");

        // Cross-field: to >= from (only when both are present and valid).
        RuleFor(x => x)
            .Must(x =>
            {
                if (x.From is null || x.To is null) return true;
                if (!DateOnly.TryParseExact(x.From, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                        DateTimeStyles.None, out var from)) return true; // already caught above
                if (!DateOnly.TryParseExact(x.To, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                        DateTimeStyles.None, out var to)) return true;   // already caught above
                return to >= from;
            })
            .WithErrorCode("Analytics.ToBeforeFrom")
            .WithMessage("'to' must be greater than or equal to 'from'.");
    }
}
