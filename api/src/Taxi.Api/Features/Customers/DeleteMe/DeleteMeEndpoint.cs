using System.Security.Cryptography;
using System.Text;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Gdpr;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Customers.DeleteMe;

/// <summary>Customer GDPR self-deletion, confirmed by an SMS code. CustomerOnly. On success: anonymizes
/// ALL of the caller's orders via the shared <see cref="CustomerAnonymizer"/> (orders KEPT so reports
/// still count them) and deletes the User row plus their refresh tokens and push subscriptions.
/// <para><b>Tenant-safe read</b>: the customer JWT carries NO fleet_id, so the scope's tenant is null.
/// The caller's orders are loaded via <c>IgnoreQueryFilters()</c> keyed on
/// <c>o.CustomerUserId == sub</c> — a plain query would hit the Order global filter with a null FleetId
/// and anonymize zero orders (WI-13 Subscribe precedent). The null-tenant scope also lets the anonymize
/// SaveChanges bypass the tenant guard for cross-fleet orders.</para></summary>
internal sealed class DeleteMeEndpoint(TaxiDbContext dbContext, TimeProvider timeProvider)
    : Endpoint<DeleteMeRequest>
{
    private const int MaxAttempts = 5;

    private readonly CustomersFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Delete("customers/me");
        Description(builder => builder
            .WithName(nameof(DeleteMeEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.CustomerOnly));

        Summary(s =>
        {
            s.Summary = "Delete my account (Customer, SMS-confirmed)";
            s.Description = "Deletes the calling customer's account after SMS-code confirmation. Past " +
                            "orders are anonymized (kept for reports); refresh tokens and push " +
                            "subscriptions are deleted along with the user.";
            s.Responses[StatusCodes.Status204NoContent] = "Account deleted; orders anonymized.";
            s.Responses[StatusCodes.Status400BadRequest] = "Missing or invalid SMS code.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated as a customer.";
            s.Responses[StatusCodes.Status404NotFound] = "No customer user for the caller.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(DeleteMeRequest req, CancellationToken ct)
    {
        var subClaim = User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subClaim, out var userId)) { await Send.NotFoundAsync(ct); return; }

        var user = await dbContext.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId && u.Role == UserRole.Customer, ct);
        if (user is null) { await Send.NotFoundAsync(ct); return; }

        // Validate the SMS code against the caller's phone, mirroring VerifyCode.
        var now = timeProvider.GetUtcNow();
        var smsCode = await dbContext.SmsCodes
            .OrderByDescending(x => x.ExpiresAt)
            .FirstOrDefaultAsync(x => x.Phone == user.Phone && x.UsedAt == null && x.ExpiresAt > now, ct);

        if (smsCode is null || smsCode.Attempts >= MaxAttempts || ComputeCodeHash(req.Code) != smsCode.CodeHash)
        {
            AddError(r => r.Code, "The confirmation code is invalid or expired.", ErrorCodes.Customer.InvalidCode);
            await Send.ErrorsAsync(400, ct);
            return;
        }

        smsCode.UsedAt = now;

        // Anonymize ALL of the caller's orders (cross-fleet) — IgnoreQueryFilters keyed on the sub.
        var orders = await dbContext.Orders.IgnoreQueryFilters()
            .Where(o => o.CustomerUserId == userId)
            .ToListAsync(ct);
        foreach (var order in orders)
        {
            CustomerAnonymizer.Anonymize(order);
        }

        // Delete the user's refresh tokens, push subscriptions, and the user — as TRACKED removals so
        // they commit in the SAME SaveChanges as the order anonymization. GDPR erasure must be atomic:
        // a partial delete (tokens gone but user/orders intact) is worse than an all-or-nothing failure.
        var refreshTokens = await dbContext.RefreshTokens.Where(t => t.UserId == userId).ToListAsync(ct);
        dbContext.RefreshTokens.RemoveRange(refreshTokens);

        var pushSubs = await dbContext.PushSubscriptions.IgnoreQueryFilters()
            .Where(p => p.UserId == userId).ToListAsync(ct);
        dbContext.PushSubscriptions.RemoveRange(pushSubs);

        dbContext.Users.Remove(user);

        await dbContext.SaveChangesAsync(ct);

        Logger.LogInformation("Customer self-deleted {UserId} {OrderCount}", userId, orders.Count);

        await Send.NoContentAsync(ct);
    }

    /// <summary>Computes the SHA-256 hex hash of the raw OTP code (matches VerifyCode).</summary>
    private static string ComputeCodeHash(string rawCode)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawCode));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
