using Microsoft.EntityFrameworkCore;
using Npgsql;
using Taxi.Api.Common.Notifications;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Common.Tracking;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Notifications;
using Microsoft.Extensions.Options;

namespace Taxi.Api.Infrastructure.Jobs;

/// <summary>Drains <c>notification_outbox</c>: per tick, scans queued/retryable rows, renders the
/// body at send time, CLAIMS a <c>notification_log</c> row (claim-then-execute dedup, AC#7), sends via
/// the channel adapter, and records the outcome. Retries 3× with backoff, then marks
/// <see cref="NotificationStatus.Failed"/> (AC#3).
/// <para><b>Testability</b>: all logic is in <see cref="RunTickAsync"/>; <c>ExecuteAsync</c> is a thin
/// PeriodicTimer shell (mirrors OfferTimeoutJob, CLAUDE.md WI-14).</para></summary>
internal sealed class NotificationDispatchJob(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<NotificationDispatchJob> logger) : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(5);
    private const int MaxAttempts = 3;

    /// <summary>Backoff per attempt number (1→10s, 2→30s). After MaxAttempts the row is Failed.</summary>
    private static TimeSpan Backoff(int attempts) => attempts switch
    {
        <= 1 => TimeSpan.FromSeconds(10),
        2 => TimeSpan.FromSeconds(30),
        _ => TimeSpan.FromMinutes(2)
    };

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TickInterval, timeProvider);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await RunTickAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Tick failed {Reason}", "UnhandledTickException");
            }
        }
    }

    /// <summary>Performs one drain tick. Called directly by integration tests.</summary>
    /// <param name="ct">Cancellation token.</param>
    public async Task RunTickAsync(CancellationToken ct)
    {
        var now = timeProvider.GetUtcNow();

        // Scan phase: cross-tenant, project minimal identity.
        List<(Guid OutboxId, Guid FleetId)> candidates;
        await using (var scanScope = scopeFactory.CreateAsyncScope())
        {
            var scanDb = scanScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            candidates = await scanDb.NotificationOutbox.IgnoreQueryFilters()
                .AsNoTracking()
                .Where(o => (o.Status == NotificationStatus.Queued || o.Status == NotificationStatus.Failed)
                    && o.Attempts < MaxAttempts
                    && o.NextAttemptAt <= now)
                .OrderBy(o => o.CreatedAt)
                .Select(o => new ValueTuple<Guid, Guid>(o.Id, o.FleetId))
                .ToListAsync(ct);
        }

        foreach (var (outboxId, fleetId) in candidates)
        {
            try
            {
                await DispatchOneAsync(outboxId, fleetId, now, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Notification dispatch failed {OutboxId} {FleetId} {Reason}",
                    outboxId, fleetId, "PerRowException");
            }
        }
    }

    private async Task DispatchOneAsync(Guid outboxId, Guid fleetId, DateTimeOffset now, CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        scope.ServiceProvider.GetRequiredService<CurrentTenant>().FleetId = fleetId;
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var outbox = await db.NotificationOutbox.FirstOrDefaultAsync(o => o.Id == outboxId, ct);
        if (outbox is null) return;

        // Resolve the stable recipient key for the dedup claim.
        var recipient = ResolveRecipientKey(outbox);
        if (recipient is null)
        {
            await MarkLogAndOutboxAsync(db, outbox, recipient: "-", NotificationStatus.SkippedNoChannel,
                error: "NoRecipient", now, ct);
            return;
        }

        // ── Claim-then-execute: insert the notification_log row BEFORE sending (AC#7). ──
        var claim = await ClaimAsync(db, outbox, recipient, now, ct);
        if (claim is null)
        {
            // A Sent log row already owns this key → a duplicate outbox row. Skip the send, mark Skipped.
            outbox.Status = NotificationStatus.Skipped;
            await db.SaveChangesAsync(ct);
            logger.LogDebug("Notification skipped duplicate {OutboxId} {FleetId} {Reason}",
                outboxId, fleetId, "AlreadyClaimed");
            return;
        }

        // ── Send ──────────────────────────────────────────────────────────────
        bool success;
        string? providerMessageId = null;
        if (outbox.Channel == NotificationChannel.Sms)
        {
            (success, providerMessageId) = await SendSmsAsync(scope, db, outbox, recipient, ct);
        }
        else
        {
            (success, providerMessageId) = await SendPushAsync(scope, db, outbox, ct);
        }

        if (success)
        {
            claim.Status = NotificationStatus.Sent;
            claim.ProviderMessageId = providerMessageId;
            claim.SentAt = now;
            outbox.Status = NotificationStatus.Sent;
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Notification sent {OutboxId} {FleetId} {Channel}",
                outboxId, fleetId, outbox.Channel.ToString());
        }
        else
        {
            outbox.Attempts++;
            if (outbox.Attempts >= MaxAttempts)
            {
                outbox.Status = NotificationStatus.Failed;
                claim.Status = NotificationStatus.Failed;
                claim.Error = "SendFailed";
                logger.LogWarning("Notification failed permanently {OutboxId} {FleetId} {Reason}",
                    outboxId, fleetId, "MaxAttempts");
            }
            else
            {
                outbox.Status = NotificationStatus.Failed; // retryable — NextAttemptAt gates the next tick
                outbox.NextAttemptAt = now + Backoff(outbox.Attempts);
                claim.Status = NotificationStatus.Queued; // keep the claim non-terminal for retry
                logger.LogWarning("Notification send failed, will retry {OutboxId} {Attempts} {Reason}",
                    outboxId, outbox.Attempts, "RetryScheduled");
            }
            await db.SaveChangesAsync(ct);
        }
    }

    /// <summary>Inserts the claim NotificationLog row. Returns the tracked row on success. On a unique
    /// violation (23505): if an existing row is already <see cref="NotificationStatus.Sent"/>, returns
    /// null (a duplicate outbox row — skip the send); otherwise returns the existing non-terminal row
    /// so THIS outbox row can retry its own send.</summary>
    private static async Task<NotificationLog?> ClaimAsync(
        TaxiDbContext db, NotificationOutbox outbox, string recipient, DateTimeOffset now, CancellationToken ct)
    {
        var existing = await db.NotificationLog
            .FirstOrDefaultAsync(l => l.FleetId == outbox.FleetId
                && l.Event == outbox.Event
                && l.OrderId == outbox.OrderId
                && l.Recipient == recipient
                && l.Channel == outbox.Channel, ct);

        if (existing is not null)
        {
            // SkippedCap and Sent are terminal "already handled" states → do not re-send.
            return existing.Status is NotificationStatus.Sent or NotificationStatus.SkippedCap
                ? null
                : existing;
        }

        var claim = new NotificationLog
        {
            Id = Guid.CreateVersion7(),
            FleetId = outbox.FleetId,
            Event = outbox.Event,
            OrderId = outbox.OrderId,
            Channel = outbox.Channel,
            Recipient = recipient,
            Status = NotificationStatus.Queued,
            CreatedAt = now
        };
        db.NotificationLog.Add(claim);

        try
        {
            await db.SaveChangesAsync(ct);
            return claim;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            // Another outbox row claimed this key between our read and insert — treat as duplicate.
            db.Entry(claim).State = EntityState.Detached;
            return null;
        }
    }

    private async Task<(bool, string?)> SendSmsAsync(
        IServiceScope scope, TaxiDbContext db, NotificationOutbox outbox, string recipient, CancellationToken ct)
    {
        var body = await RenderSmsBodyAsync(scope, db, outbox, ct);
        if (body is null) return (false, null);

        var senderName = outbox.OrderId is { } oid
            ? await db.FleetSettings.Where(fs => fs.FleetId == outbox.FleetId)
                .Select(fs => fs.SmsSenderName).FirstOrDefaultAsync(ct)
            : null;

        var sender = scope.ServiceProvider.GetRequiredService<ISmsSender>();
        var result = await sender.SendAsync(new SmsMessage(recipient, body, senderName), ct);
        return (result.Success, result.ProviderMessageId);
    }

    private async Task<(bool, string?)> SendPushAsync(
        IServiceScope scope, TaxiDbContext db, NotificationOutbox outbox, CancellationToken ct)
    {
        if (outbox.RecipientUserId is not { } userId) return (false, null);

        // Fan out to all of the user's subscriptions. IgnoreQueryFilters: customer subs have null FleetId.
        var subs = await db.PushSubscriptions.IgnoreQueryFilters()
            .Where(p => p.UserId == userId)
            .ToListAsync(ct);
        if (subs.Count == 0) return (false, null);

        var content = await RenderPushAsync(db, outbox, ct);
        var url = BuildPushUrl(outbox);
        var tag = outbox.OrderId?.ToString() ?? outbox.Event.ToString();
        var priority = outbox.Event == NotificationEvent.OfferToDriver ? "high" : "normal";
        var message = new PushMessage(content.Title, content.Body, url, tag, priority);

        var sender = scope.ServiceProvider.GetRequiredService<IPushSender>();
        var anySent = false;
        string? providerMessageId = null;
        foreach (var sub in subs)
        {
            var result = await sender.SendAsync(sub, message, ct);
            if (result.Outcome == PushSendOutcome.Sent)
            {
                anySent = true;
                providerMessageId ??= result.ProviderMessageId;
            }
        }
        return (anySent, providerMessageId);
    }

    /// <summary>Renders the SMS body at SEND time from the order's then-final state (so the tracking
    /// link carries the final PublicCode, never a stale one from a create-time retry).</summary>
    private async Task<string?> RenderSmsBodyAsync(
        IServiceScope scope, TaxiDbContext db, NotificationOutbox outbox, CancellationToken ct)
    {
        if (outbox.OrderId is not { } orderId) return null;

        var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null) return null;

        var fleetName = await db.Fleets.IgnoreQueryFilters().AsNoTracking()
            .Where(f => f.Id == outbox.FleetId).Select(f => f.Name).FirstOrDefaultAsync(ct) ?? "Taxi";
        var fleetAscii = Ascii(fleetName);

        return outbox.Event switch
        {
            NotificationEvent.OrderCreatedForCustomer =>
                SmsTemplates.OrderCreated(fleetAscii, order.PublicCode, BuildTrackingLink(scope, order, ct)),

            NotificationEvent.DriverArrived =>
                await RenderDriverArrivedSmsAsync(db, order, fleetAscii, ct),

            // Other events that fall back to SMS use the OrderCreated-style info line.
            _ => SmsTemplates.OrderCreated(fleetAscii, order.PublicCode, BuildTrackingLink(scope, order, ct))
        };
    }

    private async Task<string> RenderDriverArrivedSmsAsync(
        TaxiDbContext db, Order order, string fleetAscii, CancellationToken ct)
    {
        var (driverName, plate, color) = order.DriverId is { } driverId && order.VehicleId is { } vehicleId
            ? await ResolveDriverVehicleAsync(db, driverId, vehicleId, ct)
            : ("ridic", "", "");
        return SmsTemplates.DriverArrived(fleetAscii, Ascii(driverName), Ascii(plate), Ascii(color));
    }

    private static async Task<(string Driver, string Plate, string Color)> ResolveDriverVehicleAsync(
        TaxiDbContext db, Guid driverId, Guid vehicleId, CancellationToken ct)
    {
        var driverName = await db.Drivers.IgnoreQueryFilters().AsNoTracking()
            .Where(d => d.Id == driverId)
            .Join(db.Users.IgnoreQueryFilters(), d => d.UserId, u => u.Id, (_, u) => u.DisplayName)
            .FirstOrDefaultAsync(ct) ?? "ridic";
        var vehicle = await db.Vehicles.IgnoreQueryFilters().AsNoTracking()
            .Where(v => v.Id == vehicleId)
            .Select(v => new { v.Plate, v.Color })
            .FirstOrDefaultAsync(ct);
        return (driverName, vehicle?.Plate ?? "", vehicle?.Color ?? "");
    }

    private string BuildTrackingLink(IServiceScope scope, Order order, CancellationToken ct)
    {
        var tokenService = scope.ServiceProvider.GetRequiredService<TrackingTokenService>();
        var options = scope.ServiceProvider.GetRequiredService<IOptions<NotificationPublicOptions>>().Value;
        var token = tokenService.Mint(order.Id, timeProvider.GetUtcNow().AddHours(24));
        return TrackingLink.Build(options.PublicBaseUrl, order.PublicCode, token);
    }

    private static async Task<PushContent> RenderPushAsync(TaxiDbContext db, NotificationOutbox outbox, CancellationToken ct)
    {
        var code = outbox.OrderId is { } orderId
            ? await db.Orders.AsNoTracking().IgnoreQueryFilters()
                .Where(o => o.Id == orderId).Select(o => o.PublicCode).FirstOrDefaultAsync(ct) ?? ""
            : "";

        return outbox.Event switch
        {
            NotificationEvent.OrderCreatedForCustomer => PushTemplates.OrderCreated(code),
            NotificationEvent.DriverAssigned => PushTemplates.DriverArrived(),
            NotificationEvent.DriverArrived => PushTemplates.DriverArrived(),
            NotificationEvent.RideStarted => PushTemplates.RideStarted(),
            NotificationEvent.RideCompleted => PushTemplates.RideCompleted(),
            NotificationEvent.OrderCancelledByFleet => PushTemplates.OrderCancelled(),
            NotificationEvent.OrderCancelledByCustomer => PushTemplates.Dispatcher(code),
            NotificationEvent.OfferToDriver => PushTemplates.OfferToDriver(code),
            NotificationEvent.SmsCapWarning => PushTemplates.SmsCapWarning(),
            _ => PushTemplates.Dispatcher(code)
        };
    }

    /// <summary>Builds the click-through URL for a push notification based on the event's audience.</summary>
    private static string BuildPushUrl(NotificationOutbox outbox)
        => outbox.Event switch
        {
            NotificationEvent.OfferToDriver or NotificationEvent.ScheduledOrderReminder => "/driver",
            NotificationEvent.DriverDeclined or NotificationEvent.DriverTimedOut
                or NotificationEvent.NewAppOrderForDispatch or NotificationEvent.OrderCancelledByCustomer
                or NotificationEvent.SmsCapWarning => "/dispatcher",
            _ => "/customer"
        };

    private static string? ResolveRecipientKey(NotificationOutbox outbox)
        => outbox.Channel == NotificationChannel.Sms
            ? outbox.RecipientPhone
            : outbox.RecipientUserId?.ToString();

    private static async Task MarkLogAndOutboxAsync(
        TaxiDbContext db, NotificationOutbox outbox, string recipient,
        NotificationStatus status, string error, DateTimeOffset now, CancellationToken ct)
    {
        db.NotificationLog.Add(new NotificationLog
        {
            Id = Guid.CreateVersion7(),
            FleetId = outbox.FleetId,
            Event = outbox.Event,
            OrderId = outbox.OrderId,
            Channel = outbox.Channel,
            Recipient = recipient,
            Status = status,
            Error = error,
            CreatedAt = now
        });
        outbox.Status = status;
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Transliterates Czech diacritics to ASCII so SMS bodies stay GSM-7.</summary>
    private static string Ascii(string input)
    {
        if (string.IsNullOrEmpty(input)) return input;
        var normalized = input.Normalize(System.Text.NormalizationForm.FormD);
        var sb = new System.Text.StringBuilder(normalized.Length);
        foreach (var ch in normalized)
        {
            var cat = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch);
            if (cat != System.Globalization.UnicodeCategory.NonSpacingMark)
                sb.Append(ch);
        }
        return sb.ToString().Normalize(System.Text.NormalizationForm.FormC);
    }
}
