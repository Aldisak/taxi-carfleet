using FluentAssertions;
using FluentValidation.TestHelper;
using Taxi.Api.Common;
using Taxi.Api.Features.Orders.CreateOrder;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Tests.Orders.Write;

/// <summary>Unit tests for <see cref="CreateOrderValidator"/> covering FluentValidation rules.</summary>
public sealed class CreateOrderValidatorTests
{
    private static readonly CreateOrderValidator Validator = new();

    // ── Pickup address required ─────────────────────────────────────────────

    /// <summary>Verifies that an empty pickup address fails validation.</summary>
    [Fact]
    public void Validate_EmptyPickupAddress_FailsWithCode()
    {
        var result = Validator.TestValidate(new CreateOrderRequest
        {
            PickupAddress = string.Empty,
            PickupLat = 50.0,
            PickupLng = 14.0,
            CustomerPhone = "+420600000001",
            Passengers = 1,
            PriceType = PriceType.Meter
        });

        result.ShouldHaveValidationErrorFor(x => x.PickupAddress)
            .WithErrorCode(ErrorCodes.Validation.PickupAddressRequired);
    }

    // ── Pickup coordinates required ──────────────────────────────────────────

    /// <summary>Verifies that zero lat/lng (not supplied) fails validation.</summary>
    [Fact]
    public void Validate_ZeroPickupCoords_FailsWithCode()
    {
        var result = Validator.TestValidate(new CreateOrderRequest
        {
            PickupAddress = "Some Address",
            PickupLat = 0.0,
            PickupLng = 0.0,
            CustomerPhone = "+420600000001",
            Passengers = 1,
            PriceType = PriceType.Meter
        });

        result.ShouldHaveValidationErrorFor(x => x.PickupLat)
            .WithErrorCode(ErrorCodes.Validation.PickupCoordsRequired);
        result.ShouldHaveValidationErrorFor(x => x.PickupLng)
            .WithErrorCode(ErrorCodes.Validation.PickupCoordsRequired);
    }

    // ── Invalid phone ────────────────────────────────────────────────────────

    /// <summary>Verifies that an invalid phone number fails with the PhoneInvalid code.</summary>
    [Fact]
    public void Validate_InvalidPhone_FailsWithCode()
    {
        var result = Validator.TestValidate(new CreateOrderRequest
        {
            PickupAddress = "Some Address",
            PickupLat = 50.0,
            PickupLng = 14.0,
            CustomerPhone = "not-a-phone",
            Passengers = 1,
            PriceType = PriceType.Meter
        });

        result.ShouldHaveValidationErrorFor(x => x.CustomerPhone)
            .WithErrorCode(ErrorCodes.Validation.PhoneInvalid);
    }

    // ── Passengers < 1 ───────────────────────────────────────────────────────

    /// <summary>Verifies that zero passengers fails validation.</summary>
    [Fact]
    public void Validate_ZeroPassengers_FailsWithCode()
    {
        var result = Validator.TestValidate(new CreateOrderRequest
        {
            PickupAddress = "Some Address",
            PickupLat = 50.0,
            PickupLng = 14.0,
            CustomerPhone = "+420600000001",
            Passengers = 0,
            PriceType = PriceType.Meter
        });

        result.ShouldHaveValidationErrorFor(x => x.Passengers)
            .WithErrorCode(ErrorCodes.Validation.PassengersMinOne);
    }

    // ── Fixed price consistency ──────────────────────────────────────────────

    /// <summary>Verifies that Fixed PriceType without FixedPriceCzk fails.</summary>
    [Fact]
    public void Validate_FixedPriceWithoutAmount_FailsWithCode()
    {
        var result = Validator.TestValidate(new CreateOrderRequest
        {
            PickupAddress = "Some Address",
            PickupLat = 50.0,
            PickupLng = 14.0,
            CustomerPhone = "+420600000001",
            Passengers = 1,
            PriceType = PriceType.Fixed,
            FixedPriceCzk = null
        });

        result.ShouldHaveValidationErrorFor(x => x.FixedPriceCzk)
            .WithErrorCode(ErrorCodes.Validation.FixedPriceCzkRequired);
    }

    /// <summary>Verifies that a non-Fixed PriceType with FixedPriceCzk set fails.</summary>
    [Fact]
    public void Validate_NonFixedPriceWithAmount_FailsWithCode()
    {
        var result = Validator.TestValidate(new CreateOrderRequest
        {
            PickupAddress = "Some Address",
            PickupLat = 50.0,
            PickupLng = 14.0,
            CustomerPhone = "+420600000001",
            Passengers = 1,
            PriceType = PriceType.Meter,
            FixedPriceCzk = 100
        });

        result.ShouldHaveValidationErrorFor(x => x.FixedPriceCzk)
            .WithErrorCode(ErrorCodes.Validation.FixedPriceCzkNotAllowed);
    }

    // ── Valid request passes ──────────────────────────────────────────────────

    /// <summary>Verifies that a complete valid request has no validation errors.</summary>
    [Fact]
    public void Validate_ValidRequest_NoErrors()
    {
        var result = Validator.TestValidate(new CreateOrderRequest
        {
            PickupAddress = "Václavské náměstí 1",
            PickupLat = 50.0808,
            PickupLng = 14.4282,
            CustomerPhone = "+420600000001",
            Passengers = 2,
            PriceType = PriceType.Estimate,
            EstimatedPriceCzk = 200
        });

        result.ShouldNotHaveAnyValidationErrors();
    }
}
