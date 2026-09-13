using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Taxi.Api.Tests.Infrastructure;

/// <summary>Test <see cref="IPushSender"/> that counts sends and can be configured to return 410 Gone
/// (deleting the subscription, like the real sender) so AC#4 can be exercised without a push service.</summary>
internal sealed class RecordingPushSender(IServiceScopeFactory scopeFactory) : IPushSender
{
    private int _sendCount;

    /// <summary>Number of times <see cref="SendAsync"/> was invoked.</summary>
    public int SendCount => _sendCount;

    /// <summary>When true, every send reports 410 Gone and deletes the subscription (AC#4).</summary>
    public bool ReturnGone { get; set; }

    /// <inheritdoc />
    public async Task<PushSendResult> SendAsync(PushSubscription subscription, PushMessage message, CancellationToken ct)
    {
        Interlocked.Increment(ref _sendCount);

        if (ReturnGone)
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<Taxi.Api.Infrastructure.TaxiDbContext>();
            await db.PushSubscriptions.IgnoreQueryFilters()
                .Where(p => p.Id == subscription.Id)
                .ExecuteDeleteAsync(ct);
            return new PushSendResult(PushSendOutcome.Gone, null);
        }

        return new PushSendResult(PushSendOutcome.Sent, $"push-{Guid.CreateVersion7():N}");
    }
}
