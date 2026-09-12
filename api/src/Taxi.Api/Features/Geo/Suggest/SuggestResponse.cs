namespace Taxi.Api.Features.Geo.Suggest;

/// <summary>Response for GET /geo/suggest.</summary>
public record SuggestResponse(IReadOnlyList<SuggestItemDto> Items);
