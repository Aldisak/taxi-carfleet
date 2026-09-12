using System.Globalization;
using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Pricing.Quote;

/// <summary>Validates the GET /pricing/quote request — pickup coords required and parseable;
/// dropoff coords optional but parseable when present. Invalid doubles return a clean 400
/// (FastEndpoints double query binding is locale-sensitive; CLAUDE.md).</summary>
internal sealed class QuoteValidator : Validator<QuoteRequest>
{
    /// <summary>Initializes validation rules.</summary>
    public QuoteValidator()
    {
        RuleFor(x => x.FromLat)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.PickupCoordsRequired)
            .Must(IsParseable)
            .When(x => !string.IsNullOrEmpty(x.FromLat))
            .WithErrorCode(ErrorCodes.Validation.PickupCoordsRequired);

        RuleFor(x => x.FromLng)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.PickupCoordsRequired)
            .Must(IsParseable)
            .When(x => !string.IsNullOrEmpty(x.FromLng))
            .WithErrorCode(ErrorCodes.Validation.PickupCoordsRequired);

        RuleFor(x => x.ToLat)
            .Must(IsParseable)
            .When(x => !string.IsNullOrEmpty(x.ToLat))
            .WithErrorCode(ErrorCodes.Validation.DropoffCoordsRequired);

        RuleFor(x => x.ToLng)
            .Must(IsParseable)
            .When(x => !string.IsNullOrEmpty(x.ToLng))
            .WithErrorCode(ErrorCodes.Validation.DropoffCoordsRequired);
    }

    private static bool IsParseable(string? s) =>
        double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out _);
}
