using FluentAssertions;
using Taxi.Api.Common.Notifications;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Tests.Notifications;

/// <summary>Pure unit tests for the notification dedup key (A3).</summary>
public sealed class NotificationDedupKeyTests
{
    [Fact]
    public void NotificationDedupKey_SameInputs_SameKey()
    {
        var orderId = Guid.CreateVersion7();

        var a = NotificationDedupKey.For(NotificationEvent.DriverArrived, orderId, "+420600000001", NotificationChannel.Sms);
        var b = NotificationDedupKey.For(NotificationEvent.DriverArrived, orderId, "+420600000001", NotificationChannel.Sms);

        a.Should().Be(b);
    }

    [Fact]
    public void NotificationDedupKey_DifferentChannel_DifferentKey()
    {
        var orderId = Guid.CreateVersion7();

        var sms = NotificationDedupKey.For(NotificationEvent.DriverArrived, orderId, "recip", NotificationChannel.Sms);
        var push = NotificationDedupKey.For(NotificationEvent.DriverArrived, orderId, "recip", NotificationChannel.Push);

        sms.Should().NotBe(push);
    }

    [Fact]
    public void NotificationDedupKey_DifferentEvent_DifferentKey()
    {
        var orderId = Guid.CreateVersion7();

        var arrived = NotificationDedupKey.For(NotificationEvent.DriverArrived, orderId, "recip", NotificationChannel.Sms);
        var created = NotificationDedupKey.For(NotificationEvent.OrderCreatedForCustomer, orderId, "recip", NotificationChannel.Sms);

        arrived.Should().NotBe(created);
    }

    [Fact]
    public void NotificationDedupKey_DifferentRecipient_DifferentKey()
    {
        var orderId = Guid.CreateVersion7();

        var a = NotificationDedupKey.For(NotificationEvent.DriverArrived, orderId, "recip-a", NotificationChannel.Sms);
        var b = NotificationDedupKey.For(NotificationEvent.DriverArrived, orderId, "recip-b", NotificationChannel.Sms);

        a.Should().NotBe(b);
    }
}
