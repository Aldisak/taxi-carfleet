using FluentAssertions;
using Taxi.Api.Common.Notifications;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Tests.Notifications;

/// <summary>Pure unit tests for the static notification routing matrix (A3). No DbContext, no IO.</summary>
public sealed class NotificationRoutingTests
{
    [Fact]
    public void NotificationRouting_DriverArrived_SmsEvenWithPush()
    {
        var result = NotificationRouting.Resolve(
            NotificationEvent.DriverArrived, OrderSource.App, customerHasPush: true);

        result.Should().Contain(new NotificationRecipientChannel(
            NotificationRecipientRole.Customer, NotificationChannel.Sms),
            "DriverArrived always sends SMS — even when a push subscription exists");
        result.Should().Contain(new NotificationRecipientChannel(
            NotificationRecipientRole.Customer, NotificationChannel.Push));
    }

    [Fact]
    public void NotificationRouting_RideStarted_PushOnly()
    {
        var result = NotificationRouting.Resolve(
            NotificationEvent.RideStarted, OrderSource.App, customerHasPush: true);

        result.Should().ContainSingle()
            .Which.Should().Be(new NotificationRecipientChannel(
                NotificationRecipientRole.Customer, NotificationChannel.Push));
        result.Should().NotContain(rc => rc.Channel == NotificationChannel.Sms,
            "RideStarted is push-only — never SMS");
    }

    [Fact]
    public void NotificationRouting_RideCompleted_PushOnly()
    {
        var result = NotificationRouting.Resolve(
            NotificationEvent.RideCompleted, OrderSource.App, customerHasPush: true);

        result.Should().OnlyContain(rc => rc.Channel == NotificationChannel.Push);
    }

    [Fact]
    public void NotificationRouting_PhoneOrder_OnlyCreatedAndArrivedSms()
    {
        var created = NotificationRouting.Resolve(
            NotificationEvent.OrderCreatedForCustomer, OrderSource.Phone, customerHasPush: false);
        var arrived = NotificationRouting.Resolve(
            NotificationEvent.DriverArrived, OrderSource.Phone, customerHasPush: false);
        var started = NotificationRouting.Resolve(
            NotificationEvent.RideStarted, OrderSource.Phone, customerHasPush: false);
        var completed = NotificationRouting.Resolve(
            NotificationEvent.RideCompleted, OrderSource.Phone, customerHasPush: false);
        var assigned = NotificationRouting.Resolve(
            NotificationEvent.DriverAssigned, OrderSource.Phone, customerHasPush: false);

        created.Should().ContainSingle()
            .Which.Should().Be(new NotificationRecipientChannel(
                NotificationRecipientRole.Customer, NotificationChannel.Sms));
        arrived.Should().Contain(new NotificationRecipientChannel(
            NotificationRecipientRole.Customer, NotificationChannel.Sms));
        started.Should().BeEmpty("phone customer has no app — no RideStarted message");
        completed.Should().BeEmpty("phone customer has no app — no RideCompleted message");
        assigned.Should().BeEmpty("phone order subset is Created + Arrived only");
    }

    [Fact]
    public void NotificationRouting_AppNoPush_CreatedIsSms()
    {
        var result = NotificationRouting.Resolve(
            NotificationEvent.OrderCreatedForCustomer, OrderSource.App, customerHasPush: false);

        result.Should().ContainSingle()
            .Which.Should().Be(new NotificationRecipientChannel(
                NotificationRecipientRole.Customer, NotificationChannel.Sms),
            "app order without a push subscription falls back to SMS (with tracking link)");
    }

    [Fact]
    public void NotificationRouting_AppWithPush_CreatedIsPush()
    {
        var result = NotificationRouting.Resolve(
            NotificationEvent.OrderCreatedForCustomer, OrderSource.App, customerHasPush: true);

        result.Should().ContainSingle()
            .Which.Channel.Should().Be(NotificationChannel.Push);
    }

    [Fact]
    public void NotificationRouting_OfferToDriver_DriverPush()
    {
        var result = NotificationRouting.Resolve(
            NotificationEvent.OfferToDriver, OrderSource.App, customerHasPush: false);

        result.Should().ContainSingle()
            .Which.Should().Be(new NotificationRecipientChannel(
                NotificationRecipientRole.Driver, NotificationChannel.Push));
    }

    [Theory]
    [InlineData(NotificationEvent.DriverDeclined)]
    [InlineData(NotificationEvent.DriverTimedOut)]
    [InlineData(NotificationEvent.NewAppOrderForDispatch)]
    public void NotificationRouting_DispatcherEvents_DispatcherPush(NotificationEvent evt)
    {
        var result = NotificationRouting.Resolve(evt, OrderSource.App, customerHasPush: false);

        result.Should().Contain(new NotificationRecipientChannel(
            NotificationRecipientRole.Dispatcher, NotificationChannel.Push));
    }

    [Fact]
    public void NotificationRouting_OrderCancelledByCustomer_DriverAndDispatcherPush()
    {
        var result = NotificationRouting.Resolve(
            NotificationEvent.OrderCancelledByCustomer, OrderSource.App, customerHasPush: false);

        result.Should().Contain(new NotificationRecipientChannel(
            NotificationRecipientRole.Driver, NotificationChannel.Push));
        result.Should().Contain(new NotificationRecipientChannel(
            NotificationRecipientRole.Dispatcher, NotificationChannel.Push));
    }
}
