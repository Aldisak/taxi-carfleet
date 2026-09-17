using System.Globalization;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Geo;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Features.Geo.Suggest;

/// <summary>Address autocomplete proxy — delegates to Mapy.com via IGeoService.
/// On any upstream failure returns 200 with an empty list so the order form is never blocked.
/// This endpoint is anonymous (AllowAnonymous): fleet is resolved from the X-Fleet-Slug header
/// or JWT fleet_id claim. Rate-limited by a non-JWT key when unauthenticated (5 req/s).</summary>
internal sealed class SuggestEndpoint(IGeoService geoService, ICurrentTenant currentTenant, GeoRateLimiter rateLimiter, ILogger<SuggestEndpoint> logger)
    : Endpoint<SuggestRequest, SuggestResponse>
{
    private readonly GeoFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("geo/suggest");
        Description(builder => builder
            .WithName(nameof(SuggestEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        AllowAnonymous();

        Summary(s =>
        {
            s.Summary = "Address autocomplete";
            s.Description = "Proxies query to Mapy.com address suggest. Anonymous-by-slug: fleet resolved from X-Fleet-Slug header or JWT fleet_id. Rate-limited by non-JWT key when unauthenticated. On upstream failure returns 200 with an empty list.";
            s.Responses[StatusCodes.Status200OK] = "List of address suggestions (may be empty).";
            s.Responses[StatusCodes.Status400BadRequest] = "Query too short (fewer than 3 characters).";
            s.Responses[StatusCodes.Status429TooManyRequests] = "Rate limit exceeded (5 req/s per user/IP).";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(SuggestRequest req, CancellationToken ct)
    {
        // Rate-limit guard — always the first statement.
        // Authenticated: key on the JWT sub Guid (5 req/s per user, unchanged).
        // Anonymous: key on a stable hash of ip|slug so no anonymous caller is unlimited.
        // NOTE: Behind a reverse proxy, RemoteIpAddress is the proxy IP until ForwardedHeaders is configured.
        // This degrades to a per-proxy bucket — still bounded, never unlimited.
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

        // Fleet is used for cache + usage scoping. Customers may have no fleet_id claim;
        // fall back to Guid.Empty so suggests are cached globally (no per-fleet cost).
        var fleetId = currentTenant.FleetId ?? Guid.Empty;

        // Parse the near hint leniently — malformed input is silently ignored (never 400).
        (double Lat, double Lng)? near = null;
        if (req.Near is { Length: > 0 } nearStr)
        {
            var parts = nearStr.Split(',');
            if (parts.Length == 2
                && double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var nearLat)
                && double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var nearLng))
            {
                near = (nearLat, nearLng);
            }
        }

        var cacheResult = await geoService.SuggestAsync(fleetId, req.Q, near, ct);

        // Set source/cache headers before writing the response body.
        HttpContext.Response.Headers.Append("X-Geo-Source", "mapy");
        HttpContext.Response.Headers.Append("X-Geo-Cache", cacheResult.WasHit ? "hit" : "miss");

        if (cacheResult.Result is GeoResult<IReadOnlyList<MapySuggestResult>>.Unavailable)
        {
            logger.LogWarning("Geo suggest upstream unavailable {Reason}", "GeoUpstreamUnavailable");
            await Send.OkAsync(new SuggestResponse([]), ct);
            return;
        }

        var items = ((GeoResult<IReadOnlyList<MapySuggestResult>>.Success)cacheResult.Result).Value
            .Select(r => new SuggestItemDto(r.Name, r.Label, r.Street, r.Municipality, r.Lat, r.Lng))
            .ToList();

        await Send.OkAsync(new SuggestResponse(items), ct);
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
