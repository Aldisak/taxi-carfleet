using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Geo;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Features.Geo.Geocode;

/// <summary>Forward geocode proxy — converts a text query to coordinates via Mapy.com.
/// On upstream failure returns 200 with Found=false so the caller is never blocked.</summary>
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
        Policies(nameof(AuthorizationPolicies.CustomerOrStaff));

        Summary(s =>
        {
            s.Summary = "Forward geocode";
            s.Description = "Converts a text query to coordinates via Mapy.com. On upstream failure returns Found=false.";
            s.Responses[StatusCodes.Status200OK] = "Geocode result (Found may be false when unavailable or no match).";
            s.Responses[StatusCodes.Status400BadRequest] = "Query too short (fewer than 3 characters).";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a customer, dispatcher, or fleet admin.";
            s.Responses[StatusCodes.Status429TooManyRequests] = "Per-user rate limit exceeded (5 req/s).";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(GeocodeRequest req, CancellationToken ct)
    {
        var subClaim = User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subClaim, out var userId) || !rateLimiter.TryAcquire(userId))
        {
            AddError(Common.ErrorCodes.Geo.RateLimited);
            await Send.ErrorsAsync(429, ct);
            return;
        }

        var fleetId = currentTenant.FleetId ?? Guid.Empty;
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
}
