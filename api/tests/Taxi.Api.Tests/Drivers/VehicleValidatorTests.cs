using FluentAssertions;
using FluentValidation.TestHelper;
using Taxi.Api.Common;
using Taxi.Api.Features.Drivers.GoOnline;
using Taxi.Api.Features.Vehicles.CreateVehicle;
using Taxi.Api.Features.Vehicles.UpdateVehicle;

namespace Taxi.Api.Tests.Drivers;

/// <summary>Unit tests for vehicle create/update validators and GoOnline validator (WI-11).</summary>
public sealed class VehicleValidatorTests
{
    // ── CreateVehicleValidator ─────────────────────────────────────────────────

    /// <summary>Empty plate fails with the correct error code.</summary>
    [Fact]
    public void CreateVehicleValidator_EmptyPlate_FailsWithPlateRequiredCode()
    {
        var result = new CreateVehicleValidator().TestValidate(new CreateVehicleRequest
        {
            Plate = "",
            Make = "Toyota",
            Model = "Camry",
            Color = "White",
            Seats = 4
        });

        result.ShouldHaveValidationErrorFor(x => x.Plate)
            .WithErrorCode(ErrorCodes.Validation.PlateRequired);
    }

    /// <summary>Plate exceeding 20 characters fails with the correct error code.</summary>
    [Fact]
    public void CreateVehicleValidator_PlateTooLong_FailsWithPlateTooLongCode()
    {
        var result = new CreateVehicleValidator().TestValidate(new CreateVehicleRequest
        {
            Plate = new string('X', 21),
            Make = "Toyota",
            Model = "Camry",
            Color = "White",
            Seats = 4
        });

        result.ShouldHaveValidationErrorFor(x => x.Plate)
            .WithErrorCode(ErrorCodes.Validation.PlateTooLong);
    }

    /// <summary>Zero seats fails with the correct error code.</summary>
    [Fact]
    public void CreateVehicleValidator_ZeroSeats_FailsWithSeatsMinOneCode()
    {
        var result = new CreateVehicleValidator().TestValidate(new CreateVehicleRequest
        {
            Plate = "ABC123",
            Make = "Toyota",
            Model = "Camry",
            Color = "White",
            Seats = 0
        });

        result.ShouldHaveValidationErrorFor(x => x.Seats)
            .WithErrorCode(ErrorCodes.Validation.SeatsMinOne);
    }

    /// <summary>Valid request passes all validations.</summary>
    [Fact]
    public void CreateVehicleValidator_ValidRequest_Passes()
    {
        var result = new CreateVehicleValidator().TestValidate(new CreateVehicleRequest
        {
            Plate = "ABC123",
            Make = "Toyota",
            Model = "Camry",
            Color = "White",
            Seats = 4
        });

        result.ShouldNotHaveAnyValidationErrors();
    }

    // ── UpdateVehicleValidator ─────────────────────────────────────────────────

    /// <summary>Empty plate on update fails with the correct error code.</summary>
    [Fact]
    public void UpdateVehicleValidator_EmptyPlate_FailsWithPlateRequiredCode()
    {
        var result = new UpdateVehicleValidator().TestValidate(new UpdateVehicleRequest
        {
            Id = Guid.CreateVersion7(),
            Plate = "",
            Make = "Toyota",
            Model = "Camry",
            Color = "White",
            Seats = 4
        });

        result.ShouldHaveValidationErrorFor(x => x.Plate)
            .WithErrorCode(ErrorCodes.Validation.PlateRequired);
    }

    /// <summary>Negative seats on update fails with the correct error code.</summary>
    [Fact]
    public void UpdateVehicleValidator_NegativeSeats_FailsWithSeatsMinOneCode()
    {
        var result = new UpdateVehicleValidator().TestValidate(new UpdateVehicleRequest
        {
            Id = Guid.CreateVersion7(),
            Plate = "ABC123",
            Make = "Toyota",
            Model = "Camry",
            Color = "White",
            Seats = -1
        });

        result.ShouldHaveValidationErrorFor(x => x.Seats)
            .WithErrorCode(ErrorCodes.Validation.SeatsMinOne);
    }

    // ── GoOnlineValidator ──────────────────────────────────────────────────────

    /// <summary>Empty (default) VehicleId fails with the VehicleIdRequired error code.</summary>
    [Fact]
    public void GoOnlineValidator_EmptyVehicleId_FailsWithVehicleIdRequiredCode()
    {
        var result = new GoOnlineValidator().TestValidate(new GoOnlineRequest
        {
            VehicleId = Guid.Empty
        });

        result.ShouldHaveValidationErrorFor(x => x.VehicleId)
            .WithErrorCode(ErrorCodes.Validation.VehicleIdRequired);
    }
}
