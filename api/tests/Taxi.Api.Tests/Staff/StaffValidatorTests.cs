using FluentAssertions;
using FluentValidation.TestHelper;
using Taxi.Api.Common;
using Taxi.Api.Features.Staff.CreateStaff;

namespace Taxi.Api.Tests.Staff;

/// <summary>Unit tests for the CreateStaff validator — role allowlist, email format, and displayName rules.</summary>
public sealed class StaffValidatorTests
{
    private readonly CreateStaffValidator _validator = new();

    /// <summary>A completely valid request passes all validation rules.</summary>
    [Fact]
    public void CreateStaffValidator_ValidRequest_Passes()
    {
        var result = _validator.TestValidate(new CreateStaffRequest
        {
            Email = "test@example.com",
            DisplayName = "Test User",
            Role = "Dispatcher"
        });
        result.ShouldNotHaveAnyValidationErrors();
    }

    /// <summary>Role=Customer is not allowed — only Driver, Dispatcher, FleetAdmin.</summary>
    [Fact]
    public void CreateStaffValidator_RoleCustomer_FailsWithRoleNotAllowedCode()
    {
        var result = _validator.TestValidate(new CreateStaffRequest
        {
            Email = "test@example.com",
            DisplayName = "Test User",
            Role = "Customer"
        });
        result.ShouldHaveValidationErrorFor(x => x.Role)
            .WithErrorCode(ErrorCodes.Validation.RoleNotAllowed);
    }

    /// <summary>Role=SuperAdmin is not allowed — staff endpoints only permit Driver/Dispatcher/FleetAdmin.</summary>
    [Fact]
    public void CreateStaffValidator_RoleSuperAdmin_FailsWithRoleNotAllowedCode()
    {
        var result = _validator.TestValidate(new CreateStaffRequest
        {
            Email = "test@example.com",
            DisplayName = "Test User",
            Role = "SuperAdmin"
        });
        result.ShouldHaveValidationErrorFor(x => x.Role)
            .WithErrorCode(ErrorCodes.Validation.RoleNotAllowed);
    }

    /// <summary>Role=System is not allowed.</summary>
    [Fact]
    public void CreateStaffValidator_RoleSystem_FailsWithRoleNotAllowedCode()
    {
        var result = _validator.TestValidate(new CreateStaffRequest
        {
            Email = "test@example.com",
            DisplayName = "Test User",
            Role = "System"
        });
        result.ShouldHaveValidationErrorFor(x => x.Role)
            .WithErrorCode(ErrorCodes.Validation.RoleNotAllowed);
    }

    /// <summary>All three allowed roles pass validation.</summary>
    [Theory]
    [InlineData("Driver")]
    [InlineData("Dispatcher")]
    [InlineData("FleetAdmin")]
    public void CreateStaffValidator_AllowedRole_Passes(string role)
    {
        var result = _validator.TestValidate(new CreateStaffRequest
        {
            Email = "test@example.com",
            DisplayName = "Test User",
            Role = role
        });
        result.ShouldNotHaveValidationErrorFor(x => x.Role);
    }

    /// <summary>Empty email returns the EmailRequired error code.</summary>
    [Fact]
    public void CreateStaffValidator_EmptyEmail_FailsWithEmailRequiredCode()
    {
        var result = _validator.TestValidate(new CreateStaffRequest
        {
            Email = string.Empty,
            DisplayName = "Test User",
            Role = "Dispatcher"
        });
        result.ShouldHaveValidationErrorFor(x => x.Email)
            .WithErrorCode(ErrorCodes.Validation.EmailRequired);
    }

    /// <summary>Invalid email format returns the EmailInvalid error code.</summary>
    [Fact]
    public void CreateStaffValidator_InvalidEmail_FailsWithEmailInvalidCode()
    {
        var result = _validator.TestValidate(new CreateStaffRequest
        {
            Email = "not-an-email",
            DisplayName = "Test User",
            Role = "Dispatcher"
        });
        result.ShouldHaveValidationErrorFor(x => x.Email)
            .WithErrorCode(ErrorCodes.Validation.EmailInvalid);
    }

    /// <summary>Empty displayName returns the DisplayNameRequired error code.</summary>
    [Fact]
    public void CreateStaffValidator_EmptyDisplayName_FailsWithDisplayNameRequiredCode()
    {
        var result = _validator.TestValidate(new CreateStaffRequest
        {
            Email = "test@example.com",
            DisplayName = string.Empty,
            Role = "Dispatcher"
        });
        result.ShouldHaveValidationErrorFor(x => x.DisplayName)
            .WithErrorCode(ErrorCodes.Validation.DisplayNameRequired);
    }

    /// <summary>Empty role returns the RoleRequired error code.</summary>
    [Fact]
    public void CreateStaffValidator_EmptyRole_FailsWithRoleRequiredCode()
    {
        var result = _validator.TestValidate(new CreateStaffRequest
        {
            Email = "test@example.com",
            DisplayName = "Test User",
            Role = string.Empty
        });
        result.ShouldHaveValidationErrorFor(x => x.Role)
            .WithErrorCode(ErrorCodes.Validation.RoleRequired);
    }
}
