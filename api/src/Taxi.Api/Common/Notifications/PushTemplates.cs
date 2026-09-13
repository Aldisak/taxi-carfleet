namespace Taxi.Api.Common.Notifications;

/// <summary>Rendered push-notification title/body. Push payloads may use diacritics (unlike SMS).</summary>
/// <param name="Title">The notification title.</param>
/// <param name="Body">The notification body.</param>
public readonly record struct PushContent(string Title, string Body);

/// <summary>Pure Czech push title/body renderers. Diacritics are allowed for push.</summary>
public static class PushTemplates
{
    /// <summary>OrderCreated push.</summary>
    /// <param name="code">Public order code.</param>
    public static PushContent OrderCreated(string code)
        => new("Objednávka přijata", $"Vaše objednávka {code} byla přijata.");

    /// <summary>DriverAssigned push: who is coming. Title/body per assignment §3.</summary>
    /// <param name="driver">Driver name.</param>
    /// <param name="plate">Vehicle plate.</param>
    /// <param name="color">Vehicle color.</param>
    /// <param name="etaMinutes">Estimated arrival in minutes.</param>
    public static PushContent DriverAssigned(string driver, string plate, string color, int etaMinutes)
        => new($"Řidič přijede za ~{etaMinutes} min", $"{driver}, {plate} {color}");

    /// <summary>DriverArrived push.</summary>
    public static PushContent DriverArrived()
        => new("Řidič je na místě", "Váš řidič čeká na nástupním místě.");

    /// <summary>RideStarted push.</summary>
    public static PushContent RideStarted()
        => new("Jízda zahájena", "Přejeme příjemnou cestu.");

    /// <summary>RideCompleted push (with rating prompt).</summary>
    public static PushContent RideCompleted()
        => new("Jízda dokončena", "Děkujeme. Ohodnoťte prosím svou jízdu.");

    /// <summary>OrderCancelled push shown to the customer.</summary>
    public static PushContent OrderCancelled()
        => new("Objednávka zrušena", "Vaše objednávka byla zrušena.");

    /// <summary>OfferToDriver push (high priority).</summary>
    /// <param name="pickup">Pickup address.</param>
    public static PushContent OfferToDriver(string pickup)
        => new("Nová nabídka jízdy", pickup);

    /// <summary>Generic dispatcher push (new order / decline / timeout / cancel).</summary>
    /// <param name="code">Public order code.</param>
    public static PushContent Dispatcher(string code)
        => new("Objednávka vyžaduje pozornost", $"Objednávka {code}.");

    /// <summary>Cost-cap warning push to the FleetAdmin.</summary>
    public static PushContent SmsCapWarning()
        => new("Limit SMS se blíží", "Měsíční rozpočet na SMS je téměř vyčerpán.");
}
