namespace Taxi.Api.Features.Staff.ListStaff;

/// <summary>Summary DTO for a staff user returned in list results.</summary>
public record StaffSummaryDto(
    Guid Id,
    string DisplayName,
    string? Email,
    string Role,
    bool IsActive,
    DateTimeOffset? LastLoginAt);
