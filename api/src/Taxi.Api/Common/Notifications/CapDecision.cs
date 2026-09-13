namespace Taxi.Api.Common.Notifications;

/// <summary>The outcome of a monthly SMS cost-cap check.</summary>
public enum CapDecision
{
    /// <summary>Send is allowed (under cap, or a DriverArrived SMS which always sends).</summary>
    Allow,

    /// <summary>Skip this SMS — the monthly cap is reached and this is not a DriverArrived message.</summary>
    SkipCap
}
