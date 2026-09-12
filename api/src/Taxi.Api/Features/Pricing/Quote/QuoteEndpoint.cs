using System.Globalization;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Features.Pricing.Quote;

/// <summary>Customer price quote. Returns a fixed price when a matching PointToPoint route rule
/// exists, otherwise an estimate RANGE priced from the fleet default tariff via OSRM. Never returns
/// a single exact estimate (AC #4). Wraps geo/route server-side so geo/route itself is not widened
/// to customers.</summary>
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

    // Radius (degrees) within which a PointToPoint route's endpoints are considered a match.
    // ~0.005 deg ≈ 500 m — generous enough for address-level matching.
    private const double MatchRadiusDegrees = 0.005;

    // Minimum spread (CZK) enforced between the low and high estimate so the band is never a point.
    private const int MinEstimateSpreadCzk = 20;

    private readonly PricingFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("pricing/quote");
        Description(builder => builder
            .WithName(nameof(QuoteEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.CustomerOnly));

        Summary(s =>
        {
            s.Summary = "Get a price quote (Customer only)";
            s.Description = "Returns a fixed price (matching route rule) or an estimate range " +
                            "(tariff price +/- 10% rounded to 10 CZK). Never a single exact estimate.";
            s.Responses[StatusCodes.Status200OK] = "A fixed price or an estimate range.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid coords or no fleet resolved.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a customer.";
            s.Responses[StatusCodes.Status502BadGateway] = "Upstream route unavailable.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(QuoteRequest req, CancellationToken ct)
    {
        // Guard: tenant must be resolved (quote prices from the caller's fleet tariff/routes only).
        if (currentTenant.FleetId is null)
        {
            AddError("No fleet resolved for this request.", ErrorCodes.Validation.NoTenantResolved);
            await Send.ErrorsAsync(400, ct);
            return;
        }

        var fromLat = double.Parse(req.FromLat!, NumberStyles.Float, CultureInfo.InvariantCulture);
        var fromLng = double.Parse(req.FromLng!, NumberStyles.Float, CultureInfo.InvariantCulture);

        double? toLat = req.ToLat is not null
            ? double.Parse(req.ToLat, NumberStyles.Float, CultureInfo.InvariantCulture) : null;
        double? toLng = req.ToLng is not null
            ? double.Parse(req.ToLng, NumberStyles.Float, CultureInfo.InvariantCulture) : null;

        // ── 1. Fixed-price route match (only when a dropoff is supplied) ─────────
        if (toLat.HasValue && toLng.HasValue)
        {
            var fixedPrice = await TryMatchRouteAsync(fromLat, fromLng, toLat.Value, toLng.Value, ct);
            if (fixedPrice.HasValue)
            {
                await Send.OkAsync(new QuoteResponse("Fixed", fixedPrice.Value, null, null), ct);
                return;
            }
        }

        // ── 2. Tariff-based estimate ────────────────────────────────────────────
        var tariff = await dbContext.Tariffs.AsNoTracking()
            .Where(t => t.IsDefault && t.IsEnabled)
            .Select(t => new { t.BaseFareCzk, t.PerKmCzk, t.MinimumFareCzk })
            .FirstOrDefaultAsync(ct);

        // No dropoff → wide estimate derived from the tariff minimum (no upstream call).
        if (!toLat.HasValue || !toLng.HasValue)
        {
            var baseline = tariff?.MinimumFareCzk ?? 0;
            // Wide band: minimum .. 3x minimum (rounded to 10), guaranteed non-degenerate.
            var low = RoundTo10(baseline);
            var high = RoundTo10(Math.Max(baseline * 3, baseline + MinEstimateSpreadCzk));
            (low, high) = EnsureSpread(low, high);
            await Send.OkAsync(new QuoteResponse("Estimate", null, low, high), ct);
            return;
        }

        GeoRouteResult routeResult;
        try
        {
            routeResult = await geoProvider.RouteAsync(fromLat, fromLng, toLat.Value, toLng.Value, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Pricing quote upstream failed {Reason}", "GeoUpstreamUnavailable");
            AddError("Route upstream is unavailable.", ErrorCodes.Geo.RouteUnavailable);
            await Send.ErrorsAsync(502, ct);
            return;
        }

        var distanceKm = routeResult.DistanceMeters / 1000.0;
        var price = tariff is not null
            ? Math.Max(tariff.MinimumFareCzk, (int)Math.Round(tariff.BaseFareCzk + tariff.PerKmCzk * distanceKm))
            : 0;

        // ±10% rounded to 10 CZK, with a guaranteed minimum spread so low < high always.
        var estLow = RoundTo10((int)Math.Round(price * 0.9));
        var estHigh = RoundTo10((int)Math.Round(price * 1.1));
        (estLow, estHigh) = EnsureSpread(estLow, estHigh);

        await Send.OkAsync(new QuoteResponse("Estimate", null, estLow, estHigh), ct);
    }

    /// <summary>Finds an enabled, non-deleted, valid-now PointToPoint route whose endpoints are
    /// within <see cref="MatchRadiusDegrees"/> of the request, returning its price or null.</summary>
    private async Task<int?> TryMatchRouteAsync(double fromLat, double fromLng, double toLat, double toLng, CancellationToken ct)
    {
        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(timeProvider.GetUtcNow().UtcDateTime, PragueZone);
        var nowTime = TimeOnly.FromDateTime(nowLocal);
        var dayBit = DayBit(nowLocal.DayOfWeek);

        // Candidate PointToPoint routes for the fleet (tenant-scoped by the query filter).
        var candidates = await dbContext.Routes.AsNoTracking()
            .Where(r => r.IsEnabled
                     && r.DeletedAt == null
                     && r.Type == RouteType.PointToPoint
                     && (r.ValidDays & dayBit) == dayBit
                     && r.ToLat != null && r.ToLng != null)
            .OrderByDescending(r => r.Priority)
            .Select(r => new
            {
                r.PriceCzk,
                r.FromLat,
                r.FromLng,
                r.ToLat,
                r.ToLng,
                r.ValidFromTime,
                r.ValidToTime
            })
            .ToListAsync(ct);

        foreach (var r in candidates)
        {
            // Valid-now time window (null = all-day).
            if (r.ValidFromTime.HasValue && r.ValidToTime.HasValue
                && (nowTime < r.ValidFromTime.Value || nowTime > r.ValidToTime.Value))
            {
                continue;
            }

            if (IsWithin(r.FromLat, r.FromLng, fromLat, fromLng)
                && IsWithin(r.ToLat!.Value, r.ToLng!.Value, toLat, toLng))
            {
                return r.PriceCzk;
            }
        }

        return null;
    }

    private static bool IsWithin(double routeLat, double routeLng, double reqLat, double reqLng) =>
        Math.Abs(routeLat - reqLat) <= MatchRadiusDegrees
        && Math.Abs(routeLng - reqLng) <= MatchRadiusDegrees;

    private static int DayBit(DayOfWeek day) => day switch
    {
        DayOfWeek.Monday => 1,
        DayOfWeek.Tuesday => 2,
        DayOfWeek.Wednesday => 4,
        DayOfWeek.Thursday => 8,
        DayOfWeek.Friday => 16,
        DayOfWeek.Saturday => 32,
        DayOfWeek.Sunday => 64,
        _ => 0
    };

    private static int RoundTo10(int value) => (int)(Math.Round(value / 10.0) * 10);

    /// <summary>Guarantees a strictly positive spread between low and high (AC #4 — never exact).</summary>
    private static (int low, int high) EnsureSpread(int low, int high)
    {
        if (high - low >= MinEstimateSpreadCzk) return (low, high);
        return (low, low + MinEstimateSpreadCzk);
    }
}
