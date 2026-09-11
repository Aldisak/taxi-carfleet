using FastEndpoints;
using FluentAssertions;
using FluentValidation.TestHelper;
using Taxi.Api.Common;
using Taxi.Api.Features.Auth.RequestCode;
using Taxi.Api.Features.Auth.VerifyCode;

namespace Taxi.Api.Tests.Auth.Customer;

/// <summary>Unit tests for customer auth validators (no FastEndpoints test host required).</summary>
public sealed class CustomerAuthValidatorTests
{
    // ── RequestCodeValidator ───────────────────────────────────────────────────

    /// <summary>Empty phone fails with PhoneRequired error code.</summary>
    [Fact]
    public void RequestCodeValidator_EmptyPhone_FailsWithPhoneRequired()
    {
        var result = new RequestCodeValidator().TestValidate(new RequestCodeRequest(Phone: ""));

        result.ShouldHaveValidationErrorFor(x => x.Phone)
            .WithErrorCode(ErrorCodes.Validation.PhoneRequired);
    }

    /// <summary>Un-normalizable phone (letters) fails with PhoneInvalid error code.</summary>
    [Fact]
    public void RequestCodeValidator_InvalidPhone_FailsWithPhoneInvalid()
    {
        var result = new RequestCodeValidator().TestValidate(new RequestCodeRequest(Phone: "abc-def"));

        result.ShouldHaveValidationErrorFor(x => x.Phone)
            .WithErrorCode(ErrorCodes.Validation.PhoneInvalid);
    }

    /// <summary>Short numeric phone (5 digits) fails with PhoneInvalid error code.</summary>
    [Fact]
    public void RequestCodeValidator_ShortNumericPhone_FailsWithPhoneInvalid()
    {
        var result = new RequestCodeValidator().TestValidate(new RequestCodeRequest(Phone: "12345"));

        result.ShouldHaveValidationErrorFor(x => x.Phone)
            .WithErrorCode(ErrorCodes.Validation.PhoneInvalid);
    }

    /// <summary>A bare 9-digit Czech phone passes validation (normalizable to E.164).</summary>
    [Fact]
    public void RequestCodeValidator_CzechBarePhone_Passes()
    {
        var result = new RequestCodeValidator().TestValidate(new RequestCodeRequest(Phone: "776543210"));

        result.ShouldNotHaveAnyValidationErrors();
    }

    /// <summary>A full E.164 phone passes validation.</summary>
    [Fact]
    public void RequestCodeValidator_FullE164Phone_Passes()
    {
        var result = new RequestCodeValidator().TestValidate(new RequestCodeRequest(Phone: "+420776543210"));

        result.ShouldNotHaveAnyValidationErrors();
    }

    // ── VerifyCodeValidator ────────────────────────────────────────────────────

    /// <summary>Empty phone fails with PhoneRequired error code.</summary>
    [Fact]
    public void VerifyCodeValidator_EmptyPhone_FailsWithPhoneRequired()
    {
        var result = new VerifyCodeValidator().TestValidate(new VerifyCodeRequest(Phone: "", Code: "123456"));

        result.ShouldHaveValidationErrorFor(x => x.Phone)
            .WithErrorCode(ErrorCodes.Validation.PhoneRequired);
    }

    /// <summary>Invalid phone fails with PhoneInvalid error code.</summary>
    [Fact]
    public void VerifyCodeValidator_InvalidPhone_FailsWithPhoneInvalid()
    {
        var result = new VerifyCodeValidator().TestValidate(new VerifyCodeRequest(Phone: "not-a-phone", Code: "123456"));

        result.ShouldHaveValidationErrorFor(x => x.Phone)
            .WithErrorCode(ErrorCodes.Validation.PhoneInvalid);
    }

    /// <summary>Empty code fails with CodeRequired error code.</summary>
    [Fact]
    public void VerifyCodeValidator_EmptyCode_FailsWithCodeRequired()
    {
        var result = new VerifyCodeValidator().TestValidate(new VerifyCodeRequest(Phone: "+420776543210", Code: ""));

        result.ShouldHaveValidationErrorFor(x => x.Code)
            .WithErrorCode(ErrorCodes.Validation.CodeRequired);
    }

    /// <summary>5-digit code (too short) fails with CodeInvalid error code.</summary>
    [Fact]
    public void VerifyCodeValidator_FiveDigitCode_FailsWithCodeInvalid()
    {
        var result = new VerifyCodeValidator().TestValidate(new VerifyCodeRequest(Phone: "+420776543210", Code: "12345"));

        result.ShouldHaveValidationErrorFor(x => x.Code)
            .WithErrorCode(ErrorCodes.Validation.CodeInvalid);
    }

    /// <summary>7-digit code (too long) fails with CodeInvalid error code.</summary>
    [Fact]
    public void VerifyCodeValidator_SevenDigitCode_FailsWithCodeInvalid()
    {
        var result = new VerifyCodeValidator().TestValidate(new VerifyCodeRequest(Phone: "+420776543210", Code: "1234567"));

        result.ShouldHaveValidationErrorFor(x => x.Code)
            .WithErrorCode(ErrorCodes.Validation.CodeInvalid);
    }

    /// <summary>Non-numeric code fails with CodeInvalid error code.</summary>
    [Fact]
    public void VerifyCodeValidator_AlphaCode_FailsWithCodeInvalid()
    {
        var result = new VerifyCodeValidator().TestValidate(new VerifyCodeRequest(Phone: "+420776543210", Code: "ABCDEF"));

        result.ShouldHaveValidationErrorFor(x => x.Code)
            .WithErrorCode(ErrorCodes.Validation.CodeInvalid);
    }

    /// <summary>Valid phone and 6-digit code passes all validation rules.</summary>
    [Fact]
    public void VerifyCodeValidator_ValidRequest_Passes()
    {
        var result = new VerifyCodeValidator().TestValidate(new VerifyCodeRequest(Phone: "+420776543210", Code: "123456"));

        result.ShouldNotHaveAnyValidationErrors();
    }
}
