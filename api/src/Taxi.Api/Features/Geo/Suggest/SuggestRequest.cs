namespace Taxi.Api.Features.Geo.Suggest;

/// <summary>Request for GET /geo/suggest — address autocomplete.</summary>
public sealed class SuggestRequest
{
    /// <summary>Search query text.</summary>
    public string Q { get; set; } = string.Empty;
}
