using FluentAssertions;
using FluentValidation.TestHelper;
using Taxi.Api.Common;
using Taxi.Api.Features.Orders.CancelOrder;
using Taxi.Api.Features.Orders.CompleteOrder;
using Taxi.Api.Features.Orders.DeclineOrder;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Tests.Orders.Transitions;

/// <summary>Unit tests for the three transition validators (no database, no fixture).</summary>
public sealed class OrderTransitionValidatorTests
{
    // ── DeclineOrderValidator ─────────────────────────────────────────────────

    [Fact]
    public void DeclineOrderValidator_EmptyReason_FailsWithReasonRequired()
    {
        var validator = new DeclineOrderValidator();
        var result = validator.TestValidate(new DeclineOrderRequest { Id = Guid.NewGuid(), Reason = "" });

        result.ShouldHaveValidationErrorFor(x => x.Reason)
            .WithErrorCode(ErrorCodes.Validation.ReasonRequired);
    }

    [Fact]
    public void DeclineOrderValidator_NullReason_FailsWithReasonRequired()
    {
        var validator = new DeclineOrderValidator();
        var result = validator.TestValidate(new DeclineOrderRequest { Id = Guid.NewGuid(), Reason = null! });

        result.ShouldHaveValidationErrorFor(x => x.Reason)
            .WithErrorCode(ErrorCodes.Validation.ReasonRequired);
    }

    [Fact]
    public void DeclineOrderValidator_ValidReason_Passes()
    {
        var validator = new DeclineOrderValidator();
        var result = validator.TestValidate(new DeclineOrderRequest { Id = Guid.NewGuid(), Reason = "no fuel" });

        result.ShouldNotHaveAnyValidationErrors();
    }

    // ── CompleteOrderValidator ────────────────────────────────────────────────

    [Fact]
    public void CompleteOrderValidator_NullPaymentType_FailsWithPaymentTypeRequired()
    {
        var validator = new CompleteOrderValidator();
        var result = validator.TestValidate(new CompleteOrderRequest
        {
            Id = Guid.NewGuid(),
            FinalPriceCzk = 200,
            PaymentType = null
        });

        result.ShouldHaveValidationErrorFor(x => x.PaymentType)
            .WithErrorCode(ErrorCodes.Validation.PaymentTypeRequired);
    }

    [Fact]
    public void CompleteOrderValidator_ZeroPrice_FailsWithFinalPriceMustBePositive()
    {
        var validator = new CompleteOrderValidator();
        var result = validator.TestValidate(new CompleteOrderRequest
        {
            Id = Guid.NewGuid(),
            FinalPriceCzk = 0,
            PaymentType = PaymentType.Cash
        });

        result.ShouldHaveValidationErrorFor(x => x.FinalPriceCzk)
            .WithErrorCode(ErrorCodes.Validation.FinalPriceMustBePositive);
    }

    [Fact]
    public void CompleteOrderValidator_NegativePrice_FailsWithFinalPriceMustBePositive()
    {
        var validator = new CompleteOrderValidator();
        var result = validator.TestValidate(new CompleteOrderRequest
        {
            Id = Guid.NewGuid(),
            FinalPriceCzk = -50,
            PaymentType = PaymentType.Cash
        });

        result.ShouldHaveValidationErrorFor(x => x.FinalPriceCzk)
            .WithErrorCode(ErrorCodes.Validation.FinalPriceMustBePositive);
    }

    [Fact]
    public void CompleteOrderValidator_ValidRequest_Passes()
    {
        var validator = new CompleteOrderValidator();
        var result = validator.TestValidate(new CompleteOrderRequest
        {
            Id = Guid.NewGuid(),
            FinalPriceCzk = 250,
            PaymentType = PaymentType.Cash
        });

        result.ShouldNotHaveAnyValidationErrors();
    }

    // ── CancelOrderValidator ──────────────────────────────────────────────────

    [Fact]
    public void CancelOrderValidator_EmptyReason_FailsWithReasonRequired()
    {
        var validator = new CancelOrderValidator();
        var result = validator.TestValidate(new CancelOrderRequest { Id = Guid.NewGuid(), Reason = "" });

        result.ShouldHaveValidationErrorFor(x => x.Reason)
            .WithErrorCode(ErrorCodes.Validation.ReasonRequired);
    }

    [Fact]
    public void CancelOrderValidator_NullReason_FailsWithReasonRequired()
    {
        var validator = new CancelOrderValidator();
        var result = validator.TestValidate(new CancelOrderRequest { Id = Guid.NewGuid(), Reason = null! });

        result.ShouldHaveValidationErrorFor(x => x.Reason)
            .WithErrorCode(ErrorCodes.Validation.ReasonRequired);
    }

    [Fact]
    public void CancelOrderValidator_ValidReason_Passes()
    {
        var validator = new CancelOrderValidator();
        var result = validator.TestValidate(new CancelOrderRequest { Id = Guid.NewGuid(), Reason = "no driver" });

        result.ShouldNotHaveAnyValidationErrors();
    }
}
