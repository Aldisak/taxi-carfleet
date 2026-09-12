using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Pricing;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Features.Pricing.Quote;

/// <summary>Price quote for a prospective order. Runs the <see cref="RouteMatcher"/> over the fleet's
/// enabled, non-deleted routes + zones (loaded in memory — the jsonb Polygon is read in memory, never
/// LINQ-projected, CLAUDE.md WI-10). Precedence: a matching route → Fixed; else a known dropoff →
/// OSRM + tariff → Estimate range; else → Meter tariff summary.
/// <para><b>Access</b>: anonymous-by-slug (customer home) AND any authenticated role (driver badge,
/// dispatcher Otestovat panel). The fleet is resolved by the tenant middleware (JWT claim or
/// X-Fleet-Slug) and the read is query-filter-scoped; no fleet resolved → 400 (mirrors
/// ListCommonRoutesEndpoint's anonymous-by-slug path, but returns 400 per the quote contract).</para>
/// <para><b>Zone-no-dropoff</b>: the matcher runs even when dropoff is null — a Zone route matches on
/// pickup-in-zone alone.</para></summary>
internal sealed class QuoteEndpoint(
    IGeoProvider geoProvider,
    TaxiDbContext dbContext,
    ICurrentTenant currentTenant,
    TimeProvider timeProvider,
    ILogger<QuoteEndpoint> logger)
    : Endpoint<QuoteRequest, QuoteResponse>
{
    private static readonly TimeZoneInfo PragueZone =
        TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague");

    // Minimum spread (CZK) enforced between the low and high estimate so the band is never a point.
    private const int MinEstimateSpreadCzk = 20;

    private readonly PricingFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("pricing/quote");
        Description(builder => builder
            .WithName(nameof(QuoteEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        AllowAnonymous();

        Summary(s =>
        {
            s.Summary = "Get a price quote";
            s.Description = "Returns a Fixed price (matching route rule), an Estimate range (tariff price " +
                            "+/- 10% rounded to 10 CZK), or a Meter tariff summary. Anonymous-by-slug and any " +
                            "authenticated role. The matcher runs even without a dropoff (Zone routes match on " +
                            "pickup alone).";
            s.Responses[StatusCodes.Status200OK] = "A Fixed price, an Estimate range, or a Meter summary.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid coords or no fleet resolved.";
            s.Responses[StatusCodes.Status502BadGateway] = "Upstream route unavailable.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(QuoteRequest req, CancellationToken ct)
    {
        // Guard: tenant must be resolved (quote prices from the caller's fleet routes/tariff only).
        if (currentTenant.FleetId is null)
        {
            AddError("No fleet resolved for this request.", ErrorCodes.Validation.NoTenantResolved);
            await Send.ErrorsAsync(400, ct);
            return;
        }

        var at = req.At ?? timeProvider.GetUtcNow();

        // ── 1. Route match (runs even when dropoff is null — Zone matches on pickup alone) ──
        var routes = await dbContext.Routes.AsNoTracking()
            .Where(r => r.IsEnabled && r.DeletedAt == null)
            .ToListAsync(ct);
        // Zones: materialize first (jsonb Polygon cannot be projected in LINQ — CLAUDE.md WI-10).
        var zones = await dbContext.Zones.AsNoTracking()
            .Where(z => z.IsEnabled)
            .ToListAsync(ct);

        var match = RouteMatcher.Match(
            routes, zones, req.PickupLat, req.PickupLng, req.DropoffLat, req.DropoffLng, at, PragueZone);

        if (match is { } m)
        {
            await Send.OkAsync(new QuoteResponse("Fixed", PriceCzk: m.PriceCzk, RouteId: m.RouteId, RouteName: m.RouteName), ct);
            return;
        }

        var tariff = await dbContext.Tariffs.AsNoTracking()
            .Where(t => t.IsDefault && t.IsEnabled)
            .Select(t => new { t.BaseFareCzk, t.PerKmCzk, t.MinimumFareCzk })
            .FirstOrDefaultAsync(ct);

        // ── 2. No dropoff → Meter (no route, price by taximeter) ──
        if (req.DropoffLat is not double dropLat || req.DropoffLng is not double dropLng)
        {
            await Send.OkAsync(new QuoteResponse("Meter",
                BaseCzk: tariff?.BaseFareCzk ?? 0,
                PerKmCzk: tariff?.PerKmCzk ?? 0,
                MinimumCzk: tariff?.MinimumFareCzk ?? 0), ct);
            return;
        }

        // ── 3. Dropoff known → OSRM + tariff Estimate range ──
        GeoRouteResult routeResult;
        try
        {
            routeResult = await geoProvider.RouteAsync(req.PickupLat, req.PickupLng, dropLat, dropLng, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Pricing quote upstream failed {Reason}", "GeoUpstreamUnavailable");
            AddError("Route upstream is unavailable.", ErrorCodes.Geo.RouteUnavailable);
            await Send.ErrorsAsync(502, ct);
            return;
        }

        var distanceKm = routeResult.DistanceMeters / 1000.0;
        var durationMin = (int)Math.Round(routeResult.DurationSeconds / 60.0);

        // Tariff price = Max(Minimum, Base + PerKm*km) rounded UP to 10.
        var rawPrice = tariff is not null
            ? Math.Max(tariff.MinimumFareCzk, RoundUpTo10((int)Math.Ceiling(tariff.BaseFareCzk + tariff.PerKmCzk * distanceKm)))
            : 0;

        // ±10% rounded to 10 CZK, with a guaranteed minimum spread so low < high always.
        var low = RoundTo10((int)Math.Round(rawPrice * 0.9));
        var high = RoundTo10((int)Math.Round(rawPrice * 1.1));
        (low, high) = EnsureSpread(low, high);

        await Send.OkAsync(new QuoteResponse("Estimate",
            LowCzk: low, HighCzk: high,
            DistanceKm: Math.Round(distanceKm, 1), DurationMin: durationMin), ct);
    }

    private static int RoundTo10(int value) => (int)(Math.Round(value / 10.0) * 10);

    private static int RoundUpTo10(int value) => (int)(Math.Ceiling(value / 10.0) * 10);

    /// <summary>Guarantees a strictly positive spread between low and high (never a single exact value).</summary>
    private static (int low, int high) EnsureSpread(int low, int high)
    {
        if (high - low >= MinEstimateSpreadCzk) return (low, high);
        return (low, low + MinEstimateSpreadCzk);
    }
}
