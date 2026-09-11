namespace Taxi.Api.Features.Orders.GetOrderByCode;

/// <summary>Driver's last known GPS position.</summary>
/// <param name="Lat">Latitude.</param>
/// <param name="Lng">Longitude.</param>
public record DriverPositionDto(double Lat, double Lng);
