using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Geo;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Features.Geo.Geocode;

/// <summary>Forward geocode proxy — converts a text query to coordinates via Mapy.com.
/// On upstream failure returns 200 with Found=false so the caller is never blocked.
/// This endpoint is anonymous (AllowAnonymous): fleet is resolved from the X-Fleet-Slug header
/// or JWT fleet_id claim. Rate-limited by a non-JWT key when unauthenticated (5 req/s).
/// When no fleet is resolvable (FleetId is Guid.Empty) the endpoint short-circuits to Found=false
/// without calling GeoService, preventing FK violations in the cache layer (F1).</summary>
internal sealed class GeocodeEndpoint(IGeoService geoService, ICurrentTenant currentTenant, GeoRateLimiter rateLimiter)
    : Endpoint<GeocodeRequest, GeocodeResponse>
{
    private readonly GeoFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("geo/geocode");
        Description(builder => builder
            .WithName(nameof(GeocodeEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        AllowAnonymous();

        Summary(s =>
        {
            s.Summary = "Forward geocode";
            s.Description = "Converts a text query to coordinates via Mapy.com. Anonymous-by-slug: fleet resolved from X-Fleet-Slug header or JWT fleet_id. Rate-limited by non-JWT key when unauthenticated. Degrades to Found=false when no fleet is resolvable. On upstream failure returns Found=false.";
            s.Responses[StatusCodes.Status200OK] = "Geocode result (Found may be false when unavailable, no match, or no fleet resolved).";
            s.Responses[StatusCodes.Status400BadRequest] = "Query too short (fewer than 3 characters).";
            s.Responses[StatusCodes.Status429TooManyRequests] = "Rate limit exceeded (5 req/s per user/IP).";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(GeocodeRequest req, CancellationToken ct)
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

        var fleetId = currentTenant.FleetId ?? Guid.Empty;

        // F1: short-circuit when no fleet is resolvable — GeoService.GeocodeAsync does not have
        // a Guid.Empty bypass (unlike SuggestAsync) and would hit an FK violation in the cache layer.
        if (fleetId == Guid.Empty)
        {
            await Send.OkAsync(new GeocodeResponse(false, null, null, null), ct);
            return;
        }

        var cacheResult = await geoService.GeocodeAsync(fleetId, req.Q, ct);

        HttpContext.Response.Headers.Append("X-Geo-Source", "mapy");
        HttpContext.Response.Headers.Append("X-Geo-Cache", cacheResult.WasHit ? "hit" : "miss");

        if (cacheResult.Result is GeoResult<MapyGeocodeResult>.Unavailable)
        {
            await Send.OkAsync(new GeocodeResponse(false, null, null, null), ct);
            return;
        }

        var result = ((GeoResult<MapyGeocodeResult>.Success)cacheResult.Result).Value;
        await Send.OkAsync(new GeocodeResponse(result.Found, result.Label, result.Lat, result.Lng), ct);
    }

    /// <summary>Builds the anonymous rate-limit key from the connection IP and resolved fleet slug.</summary>
    private string BuildAnonKey()
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "noip";
        var slug = currentTenant.Slug ?? "anon";
        return $"{ip}|{slug}";
    }
}
