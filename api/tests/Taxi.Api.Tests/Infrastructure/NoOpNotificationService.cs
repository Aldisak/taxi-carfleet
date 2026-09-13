using Taxi.Api.Common.Notifications;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Tests.Infrastructure;

/// <summary>No-op <see cref="INotificationService"/> for OrderService unit tests that do not care
/// about notification enqueueing. Adds nothing to the DbContext.</summary>
internal sealed class NoOpNotificationService : INotificationService
{
    /// <inheritdoc />
    public Task NotifyAsync(NotificationEvent evt, Order order, CancellationToken ct) => Task.CompletedTask;
}
