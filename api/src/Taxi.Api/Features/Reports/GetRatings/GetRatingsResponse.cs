namespace Taxi.Api.Features.Reports.GetRatings;

/// <summary>Ratings list payload: all rated completed orders for the fleet, newest first.</summary>
/// <param name="Items">The rating entries, descending by rating time.</param>
public record GetRatingsResponse(IReadOnlyList<RatingDto> Items);
