namespace Taxi.Api.Features.Places.DeletePlace;

/// <summary>Request for deleting a place.</summary>
public sealed record DeletePlaceRequest
{
    /// <summary>The place's unique identifier.</summary>
    public Guid Id { get; init; }
}
