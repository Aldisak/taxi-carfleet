using FluentAssertions;
using FluentValidation.TestHelper;
using Taxi.Api.Common;
using Taxi.Api.Features.Admin.UpdateTenantSettings;

namespace Taxi.Api.Tests.Admin;

/// <summary>Unit tests for <see cref="UpdateTenantSettingsValidator"/>.</summary>
public sealed class UpdateTenantSettingsValidatorTests
{
    private static UpdateTenantSettingsRequest BuildValid() => new()
    {
        Id = Guid.CreateVersion7(),
        Name = "Valid Fleet",
        Phone = "+420761234567",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        OfferTimeoutSeconds = 45,
        AutoDispatchEnabled = false,
        AutoDispatchAfterSeconds = 60,
        MaxOfferRadiusKm = 15,
        SmsMonthlyCapCzk = 500,
        SmsUnitCostCzk = 1,
        WelcomeText = null,
        SmsSenderName = null,
        MapCenterLat = 50.08,
        MapCenterLng = 14.42,
        MapZoom = 12,
        GeoMonthlyCreditBudget = 250_000,
        MapyServerKey = null,
        MapyBrowserKey = null
    };

    [Fact]
    public void Validate_ValidRequest_PassesValidation()
    {
        var result = new UpdateTenantSettingsValidator().TestValidate(BuildValid());
        result.IsValid.Should().BeTrue();
    }

    // ── Fleet fields ──────────────────────────────────────────────────────────

    [Fact]
    public void Validate_EmptyName_FailsWithFleetNameRequired()
    {
        var req = BuildValid() with { Name = "" };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.Name)
            .WithErrorCode(ErrorCodes.Validation.FleetNameRequired);
    }

    [Fact]
    public void Validate_EmptyPhone_FailsWithPhoneRequired()
    {
        var req = BuildValid() with { Phone = "" };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.Phone)
            .WithErrorCode(ErrorCodes.Validation.PhoneRequired);
    }

    [Fact]
    public void Validate_EmptyTimeZone_FailsWithTimeZoneRequired()
    {
        var req = BuildValid() with { TimeZone = "" };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.TimeZone)
            .WithErrorCode(ErrorCodes.Validation.TimeZoneRequired);
    }

    [Fact]
    public void Validate_InvalidCurrency_FailsWithCurrencyInvalid()
    {
        var req = BuildValid() with { Currency = "INVALID" }; // more than 3 chars
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.Currency)
            .WithErrorCode(ErrorCodes.Validation.CurrencyInvalid);
    }

    [Fact]
    public void Validate_InvalidColorHex_FailsWithPrimaryColorInvalid()
    {
        var req = BuildValid() with { PrimaryColorHex = "notahex" };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.PrimaryColorHex)
            .WithErrorCode(ErrorCodes.Validation.PrimaryColorInvalid);
    }

    [Fact]
    public void Validate_ValidColorHex_PassesValidation()
    {
        var req = BuildValid() with { PrimaryColorHex = "#aAbBcC" };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldNotHaveValidationErrorFor(x => x.PrimaryColorHex);
    }

    // ── Dispatch fields ───────────────────────────────────────────────────────

    [Fact]
    public void Validate_OfferTimeoutTooLow_FailsWithOfferTimeoutRange()
    {
        var req = BuildValid() with { OfferTimeoutSeconds = 9 };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.OfferTimeoutSeconds)
            .WithErrorCode(ErrorCodes.Validation.OfferTimeoutRange);
    }

    [Fact]
    public void Validate_OfferTimeoutTooHigh_FailsWithOfferTimeoutRange()
    {
        var req = BuildValid() with { OfferTimeoutSeconds = 601 };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.OfferTimeoutSeconds)
            .WithErrorCode(ErrorCodes.Validation.OfferTimeoutRange);
    }

    [Fact]
    public void Validate_AutoDispatchAfterSecondsNegative_FailsWithAutoDispatchAfterSecondsNonNegative()
    {
        var req = BuildValid() with { AutoDispatchAfterSeconds = -1 };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.AutoDispatchAfterSeconds)
            .WithErrorCode(ErrorCodes.Validation.AutoDispatchAfterSecondsNonNegative);
    }

    [Fact]
    public void Validate_MaxOfferRadiusKmTooLow_FailsWithMaxOfferRadiusKmRange()
    {
        var req = BuildValid() with { MaxOfferRadiusKm = 0 };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.MaxOfferRadiusKm)
            .WithErrorCode(ErrorCodes.Validation.MaxOfferRadiusKmRange);
    }

    [Fact]
    public void Validate_MaxOfferRadiusKmTooHigh_FailsWithMaxOfferRadiusKmRange()
    {
        var req = BuildValid() with { MaxOfferRadiusKm = 101 };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.MaxOfferRadiusKm)
            .WithErrorCode(ErrorCodes.Validation.MaxOfferRadiusKmRange);
    }

    // ── SMS fields ────────────────────────────────────────────────────────────

    [Fact]
    public void Validate_SmsCapNegative_FailsWithSmsCapNonNegative()
    {
        var req = BuildValid() with { SmsMonthlyCapCzk = -1 };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.SmsMonthlyCapCzk)
            .WithErrorCode(ErrorCodes.Validation.SmsCapNonNegative);
    }

    [Fact]
    public void Validate_SmsUnitCostNegative_FailsWithSmsUnitCostNonNegative()
    {
        var req = BuildValid() with { SmsUnitCostCzk = -1 };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.SmsUnitCostCzk)
            .WithErrorCode(ErrorCodes.Validation.SmsUnitCostNonNegative);
    }

    [Fact]
    public void Validate_SmsSenderNameTooLong_FailsWithSmsSenderNameTooLong()
    {
        var req = BuildValid() with { SmsSenderName = new string('x', 101) };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.SmsSenderName)
            .WithErrorCode(ErrorCodes.Validation.SmsSenderNameTooLong);
    }

    [Fact]
    public void Validate_WelcomeTextTooLong_FailsWithWelcomeTextTooLong()
    {
        var req = BuildValid() with { WelcomeText = new string('x', 2001) };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.WelcomeText)
            .WithErrorCode(ErrorCodes.Validation.WelcomeTextTooLong);
    }

    // ── Map fields ────────────────────────────────────────────────────────────

    [Fact]
    public void Validate_MapCenterLatOutOfRange_FailsWithMapCenterLatRange()
    {
        var req = BuildValid() with { MapCenterLat = 91.0 };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.MapCenterLat)
            .WithErrorCode(ErrorCodes.Validation.MapCenterLatRange);
    }

    [Fact]
    public void Validate_MapCenterLngOutOfRange_FailsWithMapCenterLngRange()
    {
        var req = BuildValid() with { MapCenterLng = -181.0 };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.MapCenterLng)
            .WithErrorCode(ErrorCodes.Validation.MapCenterLngRange);
    }

    [Fact]
    public void Validate_MapZoomTooLow_FailsWithMapZoomRange()
    {
        var req = BuildValid() with { MapZoom = 0 };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.MapZoom)
            .WithErrorCode(ErrorCodes.Validation.MapZoomRange);
    }

    [Fact]
    public void Validate_MapZoomTooHigh_FailsWithMapZoomRange()
    {
        var req = BuildValid() with { MapZoom = 21 };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.MapZoom)
            .WithErrorCode(ErrorCodes.Validation.MapZoomRange);
    }

    [Fact]
    public void Validate_GeoMonthlyCreditBudgetNegative_FailsWithGeoMonthlyCreditBudgetNonNegative()
    {
        var req = BuildValid() with { GeoMonthlyCreditBudget = -1 };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.GeoMonthlyCreditBudget)
            .WithErrorCode(ErrorCodes.Validation.GeoMonthlyCreditBudgetNonNegative);
    }

    // ── Mapy key length validation ────────────────────────────────────────────

    [Fact]
    public void Validate_MapyServerKeyTooLong_FailsWithMapyKeyTooLong()
    {
        var req = BuildValid() with { MapyServerKey = new string('k', 513) };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.MapyServerKey)
            .WithErrorCode(ErrorCodes.Validation.MapyKeyTooLong);
    }

    [Fact]
    public void Validate_MapyBrowserKeyTooLong_FailsWithMapyKeyTooLong()
    {
        var req = BuildValid() with { MapyBrowserKey = new string('k', 513) };
        var result = new UpdateTenantSettingsValidator().TestValidate(req);
        result.ShouldHaveValidationErrorFor(x => x.MapyBrowserKey)
            .WithErrorCode(ErrorCodes.Validation.MapyKeyTooLong);
    }
}
