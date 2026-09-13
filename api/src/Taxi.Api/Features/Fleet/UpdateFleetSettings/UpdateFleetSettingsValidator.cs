using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Fleet.UpdateFleetSettings;

/// <summary>Validates <see cref="UpdateFleetSettingsRequest"/>: required name/phone, optional #RRGGBB
/// color, offer-timeout range, non-negative SMS cap, and bounded welcome text.</summary>
internal sealed class UpdateFleetSettingsValidator : Validator<UpdateFleetSettingsRequest>
{
    /// <summary>Initializes validation rules for <see cref="UpdateFleetSettingsRequest"/>.</summary>
    public UpdateFleetSettingsValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithErrorCode(ErrorCodes.Validation.FleetNameRequired);
        RuleFor(x => x.Phone).NotEmpty().WithErrorCode(ErrorCodes.Validation.PhoneRequired);

        RuleFor(x => x.PrimaryColorHex)
            .Matches("^#[0-9a-fA-F]{6}$").WithErrorCode(ErrorCodes.Validation.PrimaryColorInvalid)
            .When(x => !string.IsNullOrEmpty(x.PrimaryColorHex));

        RuleFor(x => x.OfferTimeoutSeconds)
            .InclusiveBetween(10, 600).WithErrorCode(ErrorCodes.Validation.OfferTimeoutRange);

        RuleFor(x => x.SmsMonthlyCapCzk)
            .GreaterThanOrEqualTo(0).WithErrorCode(ErrorCodes.Validation.SmsCapNonNegative);

        RuleFor(x => x.WelcomeText)
            .MaximumLength(2000).WithErrorCode(ErrorCodes.Validation.WelcomeTextTooLong)
            .When(x => x.WelcomeText is not null);
    }
}
