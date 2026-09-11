using Microsoft.EntityFrameworkCore;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Common.Tenancy;

/// <summary>Resolves the current fleet per HTTP request from, in strict precedence:
/// (1) JWT claim <c>fleet_id</c>, (2) <c>X-Fleet-Slug</c> header, (3) first subdomain label.
/// For (2) and (3) the slug is resolved to a FleetId via a database lookup (no cache in v1).
/// A slug that matches no fleet leaves <see cref="CurrentTenant.FleetId"/> null.
/// Must be placed after <c>UseAuthentication</c> so the JWT claims are already populated.</summary>
internal sealed class TenantResolutionMiddleware(RequestDelegate next)
{
    private static readonly HashSet<string> LocalHosts = ["localhost", "127.0.0.1", "::1"];

    /// <summary>Resolves the tenant from the current request and writes the result to
    /// <paramref name="tenant"/> before passing to the next middleware.</summary>
    public async Task InvokeAsync(HttpContext context, CurrentTenant tenant, TaxiDbContext dbContext)
    {
        // (1) JWT claim fleet_id — direct Guid, no DB lookup needed.
        // Gate on IsAuthenticated to guard against future auth-handler changes that could
        // populate claims on unauthenticated principals.
        var fleetIdClaim = context.User?.Identity?.IsAuthenticated == true
            ? context.User.FindFirst(TenantClaims.FleetId)?.Value
            : null;
        if (!string.IsNullOrEmpty(fleetIdClaim) && Guid.TryParse(fleetIdClaim, out var fleetIdFromClaim))
        {
            tenant.FleetId = fleetIdFromClaim;
            var fleetSlugClaim = context.User?.FindFirst(TenantClaims.FleetSlug)?.Value;
            tenant.Slug = fleetSlugClaim;
            await next(context);
            return;
        }

        // (2) X-Fleet-Slug header → resolve slug to FleetId via DB lookup.
        var slugHeader = context.Request.Headers["X-Fleet-Slug"].FirstOrDefault();
        if (!string.IsNullOrEmpty(slugHeader))
        {
            await ResolveSlugAsync(tenant, dbContext, slugHeader, context.RequestAborted);
            await next(context);
            return;
        }

        // (3) Subdomain: first label of Host, when not localhost/IP.
        var host = context.Request.Host.Host;
        if (!string.IsNullOrEmpty(host) && !LocalHosts.Contains(host))
        {
            var dotIndex = host.IndexOf('.');
            if (dotIndex > 0)
            {
                var subdomain = host[..dotIndex];
                await ResolveSlugAsync(tenant, dbContext, subdomain, context.RequestAborted);
            }
        }

        await next(context);
    }

    private static async Task ResolveSlugAsync(
        CurrentTenant tenant, TaxiDbContext dbContext, string slug, CancellationToken ct)
    {
        // Fleet has no query filter — safe to query without IgnoreQueryFilters().
        var fleet = await dbContext.Fleets
            .AsNoTracking()
            .Where(f => f.Slug == slug)
            .Select(f => new { f.Id, f.Slug })
            .FirstOrDefaultAsync(ct);

        if (fleet is not null)
        {
            tenant.FleetId = fleet.Id;
            tenant.Slug = fleet.Slug;
        }
        // else: fleet not found → leave tenant.FleetId null
    }
}
