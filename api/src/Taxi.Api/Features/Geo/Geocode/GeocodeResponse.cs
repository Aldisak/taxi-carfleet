namespace Taxi.Api.Features.Geo.Geocode;

/// <summary>Response for GET /geo/geocode — forward geocode result.</summary>
public record GeocodeResponse(bool Found, string? Label, double? Lat, double? Lng);
