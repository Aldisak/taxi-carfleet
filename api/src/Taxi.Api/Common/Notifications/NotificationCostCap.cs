using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Notifications;

/// <summary>Pure monthly SMS cost-cap policy (AC#6). No DbContext — the caller supplies the current
/// month's spend. DriverArrived always sends (it is the message that matters most), even over cap.</summary>
public static class NotificationCostCap
{
    /// <summary>Fraction of the cap at which a FleetAdmin warning is flagged.</summary>
    public const double WarningThreshold = 0.9;

    /// <summary>Decides whether a single SMS may be sent given the current month's spend.</summary>
    /// <param name="sentThisMonthCzk">CZK spent on SMS so far this month.</param>
    /// <param name="capCzk">The fleet's monthly cap in CZK.</param>
    /// <param name="unitCostCzk">Cost of one SMS in CZK.</param>
    /// <param name="evt">The event (DriverArrived is always allowed).</param>
    /// <param name="channel">The channel (only SMS is capped; push is free → always Allow).</param>
    public static CapDecision Decide(
        int sentThisMonthCzk, int capCzk, int unitCostCzk, NotificationEvent evt, NotificationChannel channel)
    {
        // Push is free — never capped.
        if (channel != NotificationChannel.Sms) return CapDecision.Allow;

        // DriverArrived always sends, even over cap.
        if (evt == NotificationEvent.DriverArrived) return CapDecision.Allow;

        // A cap of 0 or negative means "no cap configured" → allow.
        if (capCzk <= 0) return CapDecision.Allow;

        // Would sending this SMS push spend over the cap? (At-or-over cap → skip.)
        return sentThisMonthCzk + unitCostCzk > capCzk
            ? CapDecision.SkipCap
            : CapDecision.Allow;
    }

    /// <summary>True when the current spend has reached the 90% warning threshold of the cap.</summary>
    /// <param name="sentThisMonthCzk">CZK spent on SMS so far this month.</param>
    /// <param name="capCzk">The fleet's monthly cap in CZK.</param>
    public static bool IsAtWarningThreshold(int sentThisMonthCzk, int capCzk)
        => capCzk > 0 && sentThisMonthCzk >= capCzk * WarningThreshold;
}
