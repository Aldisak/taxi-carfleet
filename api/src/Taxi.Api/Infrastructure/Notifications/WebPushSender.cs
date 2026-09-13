using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WebPush;
using PushSubscriptionEntity = Taxi.Api.Infrastructure.Entities.PushSubscription;
using LibPushSubscription = WebPush.PushSubscription;

namespace Taxi.Api.Infrastructure.Notifications;

/// <summary>Web Push sender using the <c>WebPush</c> library with VAPID. On HTTP 410 Gone it deletes
/// the matching subscription (AC#4). Bumps <c>LastUsedAt</c> on a successful send. Never logs the raw
/// endpoint, keys, or VAPID private key.</summary>
internal sealed class WebPushSender(
    TaxiDbContext dbContext,
    IOptions<NotificationOptions> options,
    TimeProvider timeProvider,
    ILogger<WebPushSender> logger) : IPushSender
{
    private readonly NotificationOptions _options = options.Value;

    /// <inheritdoc />
    public async Task<PushSendResult> SendAsync(
        PushSubscriptionEntity subscription, PushMessage message, CancellationToken ct)
    {
        var vapid = new VapidDetails(_options.VapidSubject, _options.VapidPublicKey, _options.VapidPrivateKey);
        var client = new WebPushClient();

        var payload = JsonSerializer.Serialize(new
        {
            title = message.Title,
            body = message.Body,
            url = message.Url,
            tag = message.Tag,
            priority = message.Priority
        });

        var libSub = new LibPushSubscription(subscription.Endpoint, subscription.P256dh, subscription.Auth);

        try
        {
            await client.SendNotificationAsync(libSub, payload, vapid, ct);
            subscription.LastUsedAt = timeProvider.GetUtcNow();
            await dbContext.SaveChangesAsync(ct);
            return new PushSendResult(PushSendOutcome.Sent, null);
        }
        catch (WebPushException ex) when (ex.StatusCode == HttpStatusCode.Gone)
        {
            // 410 Gone: the subscription is dead — delete it (AC#4).
            await dbContext.PushSubscriptions.IgnoreQueryFilters()
                .Where(p => p.Id == subscription.Id)
                .ExecuteDeleteAsync(ct);
            logger.LogInformation("Push subscription pruned {SubscriptionId} {Reason}",
                subscription.Id, "Gone410");
            return new PushSendResult(PushSendOutcome.Gone, null);
        }
        catch (WebPushException ex)
        {
            logger.LogWarning("Push send failed {StatusCode} {Reason}",
                (int)ex.StatusCode, "ProviderError");
            return new PushSendResult(PushSendOutcome.Failed, null);
        }
    }
}
