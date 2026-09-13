using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Push.Subscribe;

/// <summary>Registers (or refreshes) a Web Push subscription for the calling user's device.
/// Upserts by <c>(UserId, Endpoint)</c> so re-subscribing the same browser is idempotent and one
/// user may register several devices. FleetId is stamped from the resolved tenant when present.</summary>
internal sealed class SubscribeEndpoint(
    TaxiDbContext dbContext,
    ICurrentTenant currentTenant,
    TimeProvider timeProvider)
    : Endpoint<SubscribeRequest, SubscribeResponse>
{
    private readonly PushFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("push/subscriptions");
        Description(builder => builder
            .WithName(nameof(SubscribeEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.AuthenticatedOnly));

        Summary(s =>
        {
            s.Summary = "Register a Web Push subscription";
            s.Description = "Upserts a push subscription for the calling user by (UserId, Endpoint). " +
                            "Any authenticated role may call. A second POST with the same endpoint updates " +
                            "the keys in place (no duplicate row).";
            s.Responses[StatusCodes.Status200OK] = "Subscription registered or refreshed.";
            s.Responses[StatusCodes.Status400BadRequest] = "Validation failed (endpoint/p256dh/auth missing).";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(SubscribeRequest req, CancellationToken ct)
    {
        var subClaim = User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subClaim, out var userId))
        {
            await Send.UnauthorizedAsync(ct);
            return;
        }

        var now = timeProvider.GetUtcNow();

        // Upsert by (UserId, Endpoint). IgnoreQueryFilters: the PushSubscription filter admits null
        // FleetId, but we key strictly on the caller's own UserId so no cross-user access is possible.
        var existing = await dbContext.PushSubscriptions.IgnoreQueryFilters()
            .FirstOrDefaultAsync(p => p.UserId == userId && p.Endpoint == req.Endpoint, ct);

        if (existing is null)
        {
            var subscription = new PushSubscription
            {
                Id = Guid.CreateVersion7(),
                FleetId = currentTenant.FleetId,
                UserId = userId,
                Endpoint = req.Endpoint,
                P256dh = req.P256dh,
                Auth = req.Auth,
                UserAgent = req.UserAgent,
                CreatedAt = now
            };
            dbContext.PushSubscriptions.Add(subscription);
            await dbContext.SaveChangesAsync(ct);
            await Send.OkAsync(new SubscribeResponse(subscription.Id), ct);
            return;
        }

        existing.P256dh = req.P256dh;
        existing.Auth = req.Auth;
        existing.UserAgent = req.UserAgent;
        existing.LastUsedAt = now;
        if (existing.FleetId is null && currentTenant.FleetId is not null)
            existing.FleetId = currentTenant.FleetId;
        await dbContext.SaveChangesAsync(ct);
        await Send.OkAsync(new SubscribeResponse(existing.Id), ct);
    }
}
