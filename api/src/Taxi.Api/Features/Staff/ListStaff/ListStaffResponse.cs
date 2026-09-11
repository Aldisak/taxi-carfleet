namespace Taxi.Api.Features.Staff.ListStaff;

/// <summary>Response body for listing staff users.</summary>
public record ListStaffResponse(IReadOnlyList<StaffSummaryDto> Items, int Total);
