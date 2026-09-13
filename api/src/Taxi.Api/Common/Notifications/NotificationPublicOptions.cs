namespace Taxi.Api.Common.Notifications;

/// <summary>Options for building absolute public links embedded in notifications (e.g. the SMS
/// tracking link). Bound from the <c>Notifications</c> configuration section.
/// <para>The dev base URL lives in appsettings.Development.json; production wiring (the real public
/// origin) is deferred to assignment 08.</para></summary>
public sealed class NotificationPublicOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Notifications";

    /// <summary>Absolute public base URL (scheme + host, no trailing slash) used to build tracking
    /// links in SMS. Example: <c>https://app.taxi-fleet.cz</c>.</summary>
    public string PublicBaseUrl { get; set; } = string.Empty;
}
