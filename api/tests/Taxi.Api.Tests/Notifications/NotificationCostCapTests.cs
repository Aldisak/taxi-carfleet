using FluentAssertions;
using Taxi.Api.Common.Notifications;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Tests.Notifications;

/// <summary>Pure unit tests for the SMS monthly cost-cap policy (A4, AC#6). No DbContext.</summary>
public sealed class NotificationCostCapTests
{
    [Fact]
    public void NotificationCostCap_ThirdNonArrival_SkipsCap()
    {
        // cap=2, unit=1, already sent 2 CZK this month → a third non-arrival SMS is over cap.
        var decision = NotificationCostCap.Decide(
            sentThisMonthCzk: 2, capCzk: 2, unitCostCzk: 1,
            NotificationEvent.OrderCreatedForCustomer, NotificationChannel.Sms);

        decision.Should().Be(CapDecision.SkipCap);
    }

    [Fact]
    public void NotificationCostCap_ArrivalAlwaysAllowed()
    {
        // Even over cap, a DriverArrived SMS must still send.
        var decision = NotificationCostCap.Decide(
            sentThisMonthCzk: 100, capCzk: 2, unitCostCzk: 1,
            NotificationEvent.DriverArrived, NotificationChannel.Sms);

        decision.Should().Be(CapDecision.Allow);
    }

    [Fact]
    public void NotificationCostCap_UnderCap_Allows()
    {
        var decision = NotificationCostCap.Decide(
            sentThisMonthCzk: 1, capCzk: 5, unitCostCzk: 1,
            NotificationEvent.OrderCreatedForCustomer, NotificationChannel.Sms);

        decision.Should().Be(CapDecision.Allow);
    }

    [Fact]
    public void NotificationCostCap_Push_AlwaysAllowed()
    {
        var decision = NotificationCostCap.Decide(
            sentThisMonthCzk: 1000, capCzk: 2, unitCostCzk: 1,
            NotificationEvent.RideStarted, NotificationChannel.Push);

        decision.Should().Be(CapDecision.Allow, "push is free — never capped");
    }

    [Fact]
    public void NotificationCostCap_At90Percent_FlagsWarning()
    {
        // cap=10 → 90% threshold is 9 CZK.
        NotificationCostCap.IsAtWarningThreshold(sentThisMonthCzk: 9, capCzk: 10).Should().BeTrue();
        NotificationCostCap.IsAtWarningThreshold(sentThisMonthCzk: 8, capCzk: 10).Should().BeFalse();
    }
}
