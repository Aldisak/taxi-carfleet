namespace Taxi.Api.Features.Zones.DeleteZone;

/// <summary>Request for deleting a zone.</summary>
public sealed record DeleteZoneRequest
{
    /// <summary>The zone's unique identifier.</summary>
    public Guid Id { get; init; }
}
