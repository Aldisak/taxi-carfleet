namespace Taxi.Api.Features.Admin.ListFleets;

/// <summary>Response for GET /admin/fleets: all fleets across all tenants (SuperAdmin).</summary>
/// <param name="Items">All fleets, newest first.</param>
public record ListFleetsResponse(IReadOnlyList<AdminFleetDto> Items);
