using System.Globalization;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Geo;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Features.Geo.Reverse;

/// <summary>Reverse geocode proxy — converts coordinates to a human-readable address via Mapy.com.
/// On upstream failure returns 200 with Found=false so the caller is never blocked.</summary>
internal sealed class ReverseEndpoint(IGeoService geoService, ICurrentTenant currentTenant, GeoRateLimiter rateLimiter)
    : Endpoint<ReverseRequest, ReverseResponse>
{
    private readonly GeoFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("geo/reverse");
        Description(builder => builder
            .WithName(nameof(ReverseEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.CustomerOrStaff));

        Summary(s =>
        {
            s.Summary = "Reverse geocode";
            s.Description = "Converts coordinates to a human-readable address via Mapy.com. On upstream failure returns Found=false.";
            s.Responses[StatusCodes.Status200OK] = "Reverse geocode result (Found may be false when unavailable or no match).";
            s.Responses[StatusCodes.Status400BadRequest] = "Coordinates missing or out of WGS84 range.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a customer, dispatcher, or fleet admin.";
            s.Responses[StatusCodes.Status429TooManyRequests] = "Per-user rate limit exceeded (5 req/s).";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(ReverseRequest req, CancellationToken ct)
    {
        var subClaim = User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subClaim, out var userId) || !rateLimiter.TryAcquire(userId))
        {
            AddError(Common.ErrorCodes.Geo.RateLimited);
            await Send.ErrorsAsync(429, ct);
            return;
        }

        // lat/lng already validated by ReverseValidator — safe to parse here.
        var lat = Math.Round(double.Parse(req.Lat!, NumberStyles.Float, CultureInfo.InvariantCulture), 4);
        var lng = Math.Round(double.Parse(req.Lng!, NumberStyles.Float, CultureInfo.InvariantCulture), 4);

        var fleetId = currentTenant.FleetId ?? Guid.Empty;
        var cacheResult = await geoService.ReverseAsync(fleetId, lat, lng, ct);

        HttpContext.Response.Headers.Append("X-Geo-Source", "mapy");
        HttpContext.Response.Headers.Append("X-Geo-Cache", cacheResult.WasHit ? "hit" : "miss");

        if (cacheResult.Result is GeoResult<MapyRgeocodeResult>.Unavailable)
        {
            await Send.OkAsync(new ReverseResponse(false, null, null, null), ct);
            return;
        }

        var result = ((GeoResult<MapyRgeocodeResult>.Success)cacheResult.Result).Value;
        await Send.OkAsync(new ReverseResponse(result.Found, result.Label, result.Street, result.Municipality), ct);
    }
}
