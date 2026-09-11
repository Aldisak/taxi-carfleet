namespace Taxi.Api.Features.Staff.UpdateStaff;

/// <summary>Response body for updating a staff user.</summary>
public record UpdateStaffResponse(
    Guid Id,
    string DisplayName,
    string? Email,
    string? Phone,
    string Role,
    bool IsActive);
