namespace Taxi.Api.Features.Staff.GetStaff;

/// <summary>Driver-specific information included when the staff member's role is Driver.</summary>
public record DriverInfoDto(Guid DriverId, string Status);
