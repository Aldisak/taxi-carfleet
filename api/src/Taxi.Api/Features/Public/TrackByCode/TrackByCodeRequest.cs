namespace Taxi.Api.Features.Public.TrackByCode;

/// <summary>Request for GET public/track/{code}?k={token}.</summary>
public sealed class TrackByCodeRequest
{
    /// <summary>Route-bound 6-character public order code.</summary>
    public string Code { get; set; } = string.Empty;

    /// <summary>Query-bound signed tracking token (the <c>k</c> parameter).</summary>
    [FastEndpoints.BindFrom("k")]
    public string? K { get; set; }
}
