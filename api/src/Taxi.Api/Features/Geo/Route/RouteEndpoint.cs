using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Features.Geo.Route;

/// <summary>Route distance/duration proxy — delegates to Mapy.com via IGeoService.
/// Computes a server-side estimated price from the caller's fleet default tariff (F-03).
/// On upstream failure returns 502 with Geo.RouteUnavailable.</summary>
internal sealed class RouteEndpoint(
    IGeoService geoService,
    TaxiDbContext dbContext,
    ICurrentTenant currentTenant,
    ILogger<RouteEndpoint> logger)
    : Endpoint<RouteRequest, RouteResponse>
{
    private readonly GeoFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("geo/route");
        Description(builder => builder
            .WithName(nameof(RouteEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DispatcherOrDriver));

        Summary(s =>
        {
            s.Summary = "Get route distance and duration";
            s.Description = "Proxies coords to Mapy.com and returns distance/duration with a server-priced estimate. On failure returns 502.";
            s.Responses[StatusCodes.Status200OK] = "Distance, duration, optional estimated price, and route geometry.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid or missing coordinates.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a dispatcher or driver.";
            s.Responses[StatusCodes.Status502BadGateway] = "Upstream route unavailable.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(RouteRequest req, CancellationToken ct)
    {
        if (currentTenant.FleetId is not { } fleetId)
        {
            AddError("No fleet resolved for this request.", ErrorCodes.Validation.NoTenantResolved);
            await Send.ErrorsAsync(400, ct);
            return;
        }

        var routeResult = await geoService.RouteAsync(
            fleetId,
            req.From!.Lat, req.From.Lng,
            req.To!.Lat, req.To.Lng,
            ct);

        // IsEstimate=true means the upstream was Unavailable → 502.
        if (routeResult.IsEstimate)
        {
            logger.LogWarning("Geo route upstream unavailable {Reason}", "GeoUpstreamUnavailable");
            AddError("Route upstream is unavailable.", ErrorCodes.Geo.RouteUnavailable);
            await Send.ErrorsAsync(502, ct);
            return;
        }

        var routeData = ((GeoResult<MapyRouteResultData>.Success)routeResult.Result).Value;

        // Set geo source/cache headers before writing the response.
        HttpContext.Response.Headers["X-Geo-Source"] = "mapy";
        HttpContext.Response.Headers["X-Geo-Cache"] = routeResult.WasHit ? "hit" : "miss";

        int? estimatedPriceCzk = null;

        var tariff = await dbContext.Tariffs.AsNoTracking()
            .Where(t => t.IsDefault && t.IsEnabled)
            .Select(t => new { t.BaseFareCzk, t.PerKmCzk, t.MinimumFareCzk })
            .FirstOrDefaultAsync(ct);

        if (tariff is not null)
        {
            var distanceKm = routeData.DistanceMeters / 1000.0;
            estimatedPriceCzk = Math.Max(tariff.MinimumFareCzk,
                (int)Math.Round(tariff.BaseFareCzk + tariff.PerKmCzk * distanceKm));
        }

        // Convert MapyGeoPoint to [lat, lng] double[] pairs for the response.
        var geometry = routeData.Geometry.Count > 0
            ? routeData.Geometry.Select(p => new double[] { p.Lat, p.Lng }).ToList()
            : null;

        await Send.OkAsync(new RouteResponse(
            routeData.DistanceMeters,
            routeData.DurationSeconds,
            estimatedPriceCzk,
            geometry), ct);
    }
}
