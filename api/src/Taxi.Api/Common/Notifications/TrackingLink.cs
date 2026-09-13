namespace Taxi.Api.Common.Notifications;

/// <summary>Builds the absolute customer tracking URL embedded in the OrderCreated SMS. Pure — shared
/// by the dispatch job and the AC#5 template-length test so the two cannot drift.</summary>
public static class TrackingLink
{
    /// <summary>Builds <c>{baseUrl}/c/t/{code}?k={token}</c> with a normalized base URL.</summary>
    /// <param name="baseUrl">Public base URL (scheme + host), trailing slash tolerated.</param>
    /// <param name="code">The order's public code.</param>
    /// <param name="token">The minted tracking token.</param>
    public static string Build(string baseUrl, string code, string token)
        => $"{baseUrl.TrimEnd('/')}/c/t/{code}?k={token}";
}
