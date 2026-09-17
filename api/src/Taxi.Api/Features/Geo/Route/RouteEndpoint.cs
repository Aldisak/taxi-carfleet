using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Geo;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Features.Geo.Route;

/// <summary>Route distance/duration proxy — delegates to Mapy.com via IGeoService.
/// Computes a server-side estimated price from the caller's fleet default tariff (F-03).
/// Anonymous callers (no JWT) are accepted and rate-limited by IP+slug exactly like geo/suggest.
/// A fleetless caller (no fleet_id claim) receives geometry but estimatedPriceCzk is always null.
/// On upstream failure returns 502 with Geo.RouteUnavailable.</summary>
internal sealed class RouteEndpoint(
    IGeoService geoService,
    TaxiDbContext dbContext,
    ICurrentTenant currentTenant,
    GeoRateLimiter rateLimiter,
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
        AllowAnonymous();

        Summary(s =>
        {
            s.Summary = "Get route distance and duration";
            s.Description = "Proxies coords to Mapy.com and returns distance/duration with a server-priced estimate. Anonymous-by-slug: fleet resolved from X-Fleet-Slug header or JWT fleet_id. Rate-limited by non-JWT key when unauthenticated. On upstream failure returns 502.";
            s.Responses[StatusCodes.Status200OK] = "Distance, duration, optional estimated price, and route geometry.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid or missing coordinates.";
            s.Responses[StatusCodes.Status429TooManyRequests] = "Rate limit exceeded (5 req/s per user/IP).";
            s.Responses[StatusCodes.Status502BadGateway] = "Upstream route unavailable.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(RouteRequest req, CancellationToken ct)
    {
        // Rate-limit guard — always the first statement.
        // Authenticated: key on the JWT sub Guid (5 req/s per user, unchanged).
        // Anonymous: key on a stable hash of ip|slug so no anonymous caller is unlimited.
        var subClaim = User.FindFirst("sub")?.Value;
        var allowed = Guid.TryParse(subClaim, out var userId)
            ? rateLimiter.TryAcquire(userId)
            : rateLimiter.TryAcquire(BuildAnonKey());

        if (!allowed)
        {
            AddError(Common.ErrorCodes.Geo.RateLimited);
            await Send.ErrorsAsync(429, ct);
            return;
        }

        // Fleet is used for cache + tariff pricing. Customers/anonymous callers may have no fleet_id claim;
        // fall back to Guid.Empty so route is fetched without FK constraints (no cache write, no usage).
        var fleetId = currentTenant.FleetId ?? Guid.Empty;

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

        // Tariff pricing is fleet-scoped. Fleetless callers (Guid.Empty) have no tariff row;
        // the query simply returns nothing and estimatedPriceCzk stays null.
        if (fleetId != Guid.Empty)
        {
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

    /// <summary>Builds the anonymous rate-limit key from the connection IP and resolved fleet slug.
    /// Format: <c>{ip}|{slug}</c> or fallback literals when not available.
    /// The key is passed to <see cref="GeoRateLimiter.DeriveAnonBucketId"/> for stable Guid derivation.</summary>
    private string BuildAnonKey()
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "noip";
        var slug = currentTenant.Slug ?? "anon";
        return $"{ip}|{slug}";
    }
}
