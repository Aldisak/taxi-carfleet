namespace Taxi.Api.Features.Geo.Reverse;

/// <summary>Response for GET /geo/reverse — reverse geocode result.</summary>
public record ReverseResponse(bool Found, string? Label, string? Street, string? Municipality);
