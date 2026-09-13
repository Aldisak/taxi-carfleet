namespace Taxi.Api.Infrastructure.Notifications;

/// <summary>Channel options for notifications, bound from the <c>Notifications</c> configuration
/// section. Dev VAPID keys live in appsettings.Development.json; production keys + the SMS provider
/// secret are deferred to assignment 08.</summary>
public sealed class NotificationOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Notifications";

    /// <summary>Selected SMS provider: <c>Console</c> (default dev/test), <c>GoSms</c>, or <c>Smsbrana</c>.</summary>
    public string SmsProvider { get; set; } = "Console";

    /// <summary>VAPID subject (a mailto: or https: contact URI).</summary>
    public string VapidSubject { get; set; } = string.Empty;

    /// <summary>VAPID public key (base64url).</summary>
    public string VapidPublicKey { get; set; } = string.Empty;

    /// <summary>VAPID private key (base64url). Never logged.</summary>
    public string VapidPrivateKey { get; set; } = string.Empty;
}
