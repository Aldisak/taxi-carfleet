using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Admin.UpdateTenantSettings;

/// <summary>Validates <see cref="UpdateTenantSettingsRequest"/>: required Fleet fields,
/// optional color/timezone/currency format, dispatch/SMS/map/geo bounds, and Mapy key lengths.</summary>
internal sealed class UpdateTenantSettingsValidator : Validator<UpdateTenantSettingsRequest>
{
    /// <summary>Initializes validation rules for <see cref="UpdateTenantSettingsRequest"/>.</summary>
    public UpdateTenantSettingsValidator()
    {
        // Fleet required fields
        RuleFor(x => x.Name).NotEmpty().WithErrorCode(ErrorCodes.Validation.FleetNameRequired);
        RuleFor(x => x.Phone).NotEmpty().WithErrorCode(ErrorCodes.Validation.PhoneRequired);
        RuleFor(x => x.TimeZone).NotEmpty().WithErrorCode(ErrorCodes.Validation.TimeZoneRequired);

        // Currency must be exactly 3 letters (ISO 4217)
        RuleFor(x => x.Currency)
            .Matches("^[A-Za-z]{3}$").WithErrorCode(ErrorCodes.Validation.CurrencyInvalid);

        // Optional primary color
        RuleFor(x => x.PrimaryColorHex)
            .Matches("^#[0-9a-fA-F]{6}$").WithErrorCode(ErrorCodes.Validation.PrimaryColorInvalid)
            .When(x => !string.IsNullOrEmpty(x.PrimaryColorHex));

        // Dispatch
        RuleFor(x => x.OfferTimeoutSeconds)
            .InclusiveBetween(10, 600).WithErrorCode(ErrorCodes.Validation.OfferTimeoutRange);

        RuleFor(x => x.AutoDispatchAfterSeconds)
            .GreaterThanOrEqualTo(0).WithErrorCode(ErrorCodes.Validation.AutoDispatchAfterSecondsNonNegative);

        RuleFor(x => x.MaxOfferRadiusKm)
            .InclusiveBetween(1, 100).WithErrorCode(ErrorCodes.Validation.MaxOfferRadiusKmRange);

        // SMS
        RuleFor(x => x.SmsMonthlyCapCzk)
            .GreaterThanOrEqualTo(0).WithErrorCode(ErrorCodes.Validation.SmsCapNonNegative);

        RuleFor(x => x.SmsUnitCostCzk)
            .GreaterThanOrEqualTo(0).WithErrorCode(ErrorCodes.Validation.SmsUnitCostNonNegative);

        RuleFor(x => x.SmsSenderName)
            .MaximumLength(100).WithErrorCode(ErrorCodes.Validation.SmsSenderNameTooLong)
            .When(x => x.SmsSenderName is not null);

        RuleFor(x => x.WelcomeText)
            .MaximumLength(2000).WithErrorCode(ErrorCodes.Validation.WelcomeTextTooLong)
            .When(x => x.WelcomeText is not null);

        // Map
        RuleFor(x => x.MapCenterLat)
            .InclusiveBetween(-90.0, 90.0).WithErrorCode(ErrorCodes.Validation.MapCenterLatRange);

        RuleFor(x => x.MapCenterLng)
            .InclusiveBetween(-180.0, 180.0).WithErrorCode(ErrorCodes.Validation.MapCenterLngRange);

        RuleFor(x => x.MapZoom)
            .InclusiveBetween(1, 20).WithErrorCode(ErrorCodes.Validation.MapZoomRange);

        // Geo budget
        RuleFor(x => x.GeoMonthlyCreditBudget)
            .GreaterThanOrEqualTo(0).WithErrorCode(ErrorCodes.Validation.GeoMonthlyCreditBudgetNonNegative);

        // Mapy key lengths (only when non-null and non-empty to allow keep/clear semantics)
        RuleFor(x => x.MapyServerKey)
            .MaximumLength(512).WithErrorCode(ErrorCodes.Validation.MapyKeyTooLong)
            .When(x => !string.IsNullOrEmpty(x.MapyServerKey));

        RuleFor(x => x.MapyBrowserKey)
            .MaximumLength(512).WithErrorCode(ErrorCodes.Validation.MapyKeyTooLong)
            .When(x => !string.IsNullOrEmpty(x.MapyBrowserKey));
    }
}
