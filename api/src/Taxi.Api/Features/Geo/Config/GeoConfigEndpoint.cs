using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Geo;
using Taxi.Api.Common.Security;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Geo.Config;

/// <summary>Returns the Mapy.com tile configuration for the current fleet.
/// <para>Anonymous by design: the customer tracking map must load before the user logs in.
/// The fleet is resolved from the X-Fleet-Slug header or subdomain by TenantResolutionMiddleware.
/// Returns ONLY the browser key — the server key is structurally absent from the response DTO.</para></summary>
internal sealed class GeoConfigEndpoint(
    TaxiDbContext dbContext,
    ICurrentTenant currentTenant,
    IFleetKeyProtector keyProtector,
    IConfiguration configuration)
    : EndpointWithoutRequest<GeoConfigResponse>
{
    private readonly GeoFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("geo/config");
        Description(builder => builder
            .WithName(nameof(GeoConfigEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        AllowAnonymous();

        Summary(s =>
        {
            s.Summary = "Get geo tile configuration";
            s.Description = "Returns the Mapy.com tile URL template, browser key, attribution HTML, " +
                            "and map center/zoom for the current fleet. Anonymous endpoint for the customer PWA. " +
                            "Server key is never included in the response.";
            s.Responses[StatusCodes.Status200OK] = "Tile configuration for the resolved fleet.";
            s.Responses[StatusCodes.Status404NotFound] = "No fleet resolved for the request (unknown or missing slug).";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        // Guard: no fleet resolved → 404 (consistent with GetFleetEndpoint pattern).
        if (currentTenant.FleetId is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        var fleetId = currentTenant.FleetId.Value;

        var settings = await dbContext.FleetSettings.AsNoTracking()
            .Where(s => s.FleetId == fleetId)
            .Select(s => new
            {
                s.MapyBrowserKey,
                s.MapCenterLat,
                s.MapCenterLng,
                s.MapZoom
            })
            .FirstOrDefaultAsync(ct);

        // Resolve browser key: fleet's decrypted key, or environment fallback.
        var browserKey = keyProtector.Unprotect(settings?.MapyBrowserKey)
            ?? configuration["Mapy:BrowserKey"]
            ?? string.Empty;

        // Cache for one week — tile config is almost never updated.
        HttpContext.Response.Headers.CacheControl = "public, max-age=604800";

        await Send.OkAsync(new GeoConfigResponse(
            TileUrlTemplate: MapyConstants.TileUrlTemplate,
            BrowserKey: browserKey,
            AttributionHtml: MapyConstants.AttributionHtml,
            MapCenterLat: settings?.MapCenterLat ?? 50.08,
            MapCenterLng: settings?.MapCenterLng ?? 14.42,
            MapZoom: settings?.MapZoom ?? 12), ct);
    }
}
