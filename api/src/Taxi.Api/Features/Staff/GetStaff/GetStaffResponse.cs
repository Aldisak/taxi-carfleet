namespace Taxi.Api.Features.Staff.GetStaff;

/// <summary>Detail response for a single staff user. Includes driver row info when Role is Driver.</summary>
public record GetStaffResponse(
    Guid Id,
    string DisplayName,
    string? Email,
    string? Phone,
    string Role,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt,
    DriverInfoDto? DriverInfo);
