namespace Taxi.Api.Features.Public.TrackByCode;

/// <summary>Driver's last known position exposed on the public tracking DTO.</summary>
/// <param name="Lat">Latitude.</param>
/// <param name="Lng">Longitude.</param>
public record TrackPositionDto(double Lat, double Lng);
