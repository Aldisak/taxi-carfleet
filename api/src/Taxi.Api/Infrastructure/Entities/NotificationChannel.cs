namespace Taxi.Api.Infrastructure.Entities;

/// <summary>The delivery channel for a notification. Stored as a string.</summary>
public enum NotificationChannel
{
    /// <summary>SMS (costs money — send only when push is unavailable or the message matters most).</summary>
    Sms,

    /// <summary>Web Push (free — preferred whenever a subscription exists).</summary>
    Push
}
