namespace Taxi.Api.Features.Reports.GetRatings;

/// <summary>A single customer rating entry in the ratings list.</summary>
/// <param name="OrderPublicCode">The order's human-readable public code.</param>
/// <param name="DriverName">The driver's display name, or null when no driver is linked.</param>
/// <param name="Stars">The 1..5 star rating.</param>
/// <param name="Comment">Optional free-text comment; null when none.</param>
/// <param name="RatedAt">UTC timestamp when the rating was left.</param>
public record RatingDto(
    string OrderPublicCode,
    string? DriverName,
    int Stars,
    string? Comment,
    DateTimeOffset? RatedAt);
