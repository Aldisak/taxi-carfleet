namespace Taxi.Api.Features.Admin.ListFleets;

/// <summary>A fleet row in the SuperAdmin fleet list.</summary>
/// <param name="Id">The fleet id.</param>
/// <param name="Slug">The fleet slug.</param>
/// <param name="Name">The fleet display name.</param>
/// <param name="Phone">The fleet contact phone.</param>
/// <param name="IsActive">Whether the fleet is currently active.</param>
/// <param name="CreatedAt">UTC creation timestamp.</param>
public record AdminFleetDto(
    Guid Id,
    string Slug,
    string Name,
    string Phone,
    bool IsActive,
    DateTimeOffset CreatedAt);
