namespace Taxi.Api.Common.Notifications;

/// <summary>Pure Czech GSM-7 SMS template renderers (no diacritics, to stay in a single 160-char
/// GSM-7 message). The canonical template strings live in
/// <c>Infrastructure/Notifications/Templates/cs/*.txt</c> and are mirrored here as the rendering
/// source of truth (kept in sync; the .txt files are the human-readable reference).</summary>
public static class SmsTemplates
{
    /// <summary>OrderCreated SMS: confirmation + tracking link. Template:
    /// <c>Taxi {fleet}: objednavka {code} prijata. Sledujte: {link}</c></summary>
    /// <param name="fleet">Fleet display name (ASCII-normalized).</param>
    /// <param name="code">Public order code (6 chars).</param>
    /// <param name="link">Absolute tracking URL.</param>
    public static string OrderCreated(string fleet, string code, string link)
        => $"Taxi {fleet}: objednavka {code} prijata. Sledujte: {link}";

    /// <summary>DriverArrived SMS: the driver is at the pickup. Template:
    /// <c>Taxi {fleet}: ridic {driver} je na miste, {plate} {color}.</c></summary>
    /// <param name="fleet">Fleet display name (ASCII-normalized).</param>
    /// <param name="driver">Driver name (ASCII-normalized).</param>
    /// <param name="plate">Vehicle plate.</param>
    /// <param name="color">Vehicle color (ASCII-normalized).</param>
    public static string DriverArrived(string fleet, string driver, string plate, string color)
        => $"Taxi {fleet}: ridic {driver} je na miste, {plate} {color}.";
}
