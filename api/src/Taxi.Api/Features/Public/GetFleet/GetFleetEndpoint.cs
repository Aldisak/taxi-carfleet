using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Public.GetFleet;

/// <summary>Returns the resolved fleet's public branding fields for the customer PWA.
/// <para>Anonymous by design: the customer PWA loads branding (name, phone, color) BEFORE the
/// customer logs in, so no JWT is available. <c>TenantResolutionMiddleware</c> resolves the fleet
/// from the <c>X-Fleet-Slug</c> header or the request subdomain even for anonymous requests (its
/// JWT-claim branch is the only branch gated on IsAuthenticated), so the EF global query filter
/// auto-scopes the read and there is no cross-fleet leak.</para></summary>
internal sealed class GetFleetEndpoint(TaxiDbContext dbContext, ICurrentTenant currentTenant)
    : EndpointWithoutRequest<GetFleetResponse>
{
    private readonly PublicFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("public/fleet");
        Description(builder => builder
            .WithName(nameof(GetFleetEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        AllowAnonymous();

        Summary(s =>
        {
            s.Summary = "Get public fleet branding";
            s.Description = "Anonymous branding endpoint for the customer PWA before login. " +
                            "The fleet is resolved from the X-Fleet-Slug header or subdomain by the tenant " +
                            "middleware (which runs for anonymous requests). Returns 404 when no fleet resolves.";
            s.Responses[StatusCodes.Status200OK] = "Public fleet branding fields.";
            s.Responses[StatusCodes.Status404NotFound] = "No fleet resolved for the request (unknown or missing slug).";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        // Guard: no fleet resolved → 404 (no unscoped query).
        if (currentTenant.FleetId is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        var fleetId = currentTenant.FleetId.Value;

        // Projection to the resolved fleet's public fields + logo-updated signal.
        var row = await dbContext.Fleets.AsNoTracking()
            .Where(f => f.Id == fleetId)
            .Select(f => new { f.Name, f.Phone, f.PrimaryColorHex, f.Currency, f.TimeZone, f.LogoUpdatedAt })
            .FirstOrDefaultAsync(ct);

        if (row is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        // WelcomeText from FleetSettings (tenant-scoped). Derive the logo URL with a cache-bust when set.
        var welcomeText = await dbContext.FleetSettings.AsNoTracking()
            .Where(s => s.FleetId == fleetId)
            .Select(s => s.WelcomeText)
            .FirstOrDefaultAsync(ct);

        var logoUrl = row.LogoUpdatedAt is DateTimeOffset stamp
            ? $"/fleets/{fleetId}/logo.png?v={stamp.UtcTicks}"
            : null;

        await Send.OkAsync(new GetFleetResponse(
            row.Name, row.Phone, row.PrimaryColorHex, row.Currency, row.TimeZone, welcomeText, logoUrl), ct);
    }
}
