using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Push.Unsubscribe;

/// <summary>Removes the calling user's push subscription with the given endpoint. Idempotent: an
/// unknown endpoint is a no-op 204 (no 404 leak of whether the endpoint existed).</summary>
internal sealed class UnsubscribeEndpoint(TaxiDbContext dbContext)
    : Endpoint<UnsubscribeRequest>
{
    private readonly PushFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Delete("push/subscriptions");
        Description(builder => builder
            .WithName(nameof(UnsubscribeEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.AuthenticatedOnly));

        Summary(s =>
        {
            s.Summary = "Remove a Web Push subscription";
            s.Description = "Deletes the calling user's subscription with the given endpoint. " +
                            "A non-existent endpoint is a no-op 204 (idempotent, no leak).";
            s.Responses[StatusCodes.Status204NoContent] = "Subscription removed (or was already absent).";
            s.Responses[StatusCodes.Status400BadRequest] = "Validation failed (endpoint missing).";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(UnsubscribeRequest req, CancellationToken ct)
    {
        var subClaim = User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subClaim, out var userId))
        {
            await Send.UnauthorizedAsync(ct);
            return;
        }

        // UserId-scoped delete: only the caller's own subscription with this endpoint.
        await dbContext.PushSubscriptions.IgnoreQueryFilters()
            .Where(p => p.UserId == userId && p.Endpoint == req.Endpoint)
            .ExecuteDeleteAsync(ct);

        await Send.NoContentAsync(ct);
    }
}
