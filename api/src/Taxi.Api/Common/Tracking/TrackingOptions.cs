namespace Taxi.Api.Common.Tracking;

/// <summary>Options for the customer SMS tracking-link token, bound from the <c>Tracking</c>
/// configuration section. The HMAC key signs the public tracking token.
/// <para>The dev key lives in appsettings.Development.json; the production key wiring (a real
/// secret, never the dev value) is deferred to assignment 08. The raw key and minted tokens are
/// never logged.</para></summary>
public sealed class TrackingOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Tracking";

    /// <summary>HMAC-SHA256 signing key for tracking tokens. Must differ between dev and prod.</summary>
    public string HmacKey { get; set; } = string.Empty;
}
