namespace Taxi.Api.Features.Places.UpdatePlace;

/// <summary>Request body for PUT /places/{id}. The id is bound from the route.</summary>
public sealed class UpdatePlaceRequest
{
    /// <summary>The place id (from the route).</summary>
    public Guid Id { get; init; }

    /// <summary>Display name of the place.</summary>
    public string Name { get; init; } = string.Empty;

    /// <summary>Latitude of the place.</summary>
    public double Lat { get; init; }

    /// <summary>Longitude of the place.</summary>
    public double Lng { get; init; }

    /// <summary>Human-readable address of the place.</summary>
    public string Address { get; init; } = string.Empty;

    /// <summary>Display sort order (ascending). Must be zero or greater.</summary>
    public int SortOrder { get; init; }

    /// <summary>Whether the place is enabled.</summary>
    public bool IsEnabled { get; init; }
}
