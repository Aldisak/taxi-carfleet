using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Routes.ListCommonRoutes;

/// <summary>Returns the fleet's common fixed-price routes for the customer Home screen.
/// <para>Anonymous by design (AC#1): a logged-out visitor must see the fleet's common routes on Home
/// and order one in 3 taps before any login. The fleet is resolved from the <c>X-Fleet-Slug</c> header
/// or subdomain by <c>TenantResolutionMiddleware</c> (its JWT-claim branch is the only branch gated on
/// IsAuthenticated), so the EF global query filter auto-scopes the read — there is no cross-fleet leak.
/// This mirrors <c>public/fleet</c> and <c>public/track</c>; geo/suggest and pricing/quote stay
/// CustomerOnly — only this read-only listing is public.</para>
/// <para>When ValidNow is true, returns only enabled, non-soft-deleted routes whose ValidDays bit
/// matches the current Europe/Prague weekday and whose time window contains the current Europe/Prague
/// time (null window = all-day), ordered by Priority descending. For PointToPoint routes the DTO
/// carries pickup/dropoff coordinates + addresses so the customer create-order validator is satisfied
/// without geocoding.</para></summary>
internal sealed class ListCommonRoutesEndpoint(
    TaxiDbContext dbContext,
    ICurrentTenant currentTenant,
    TimeProvider timeProvider)
    : Endpoint<ListCommonRoutesRequest, ListCommonRoutesResponse>
{
    private static readonly TimeZoneInfo PragueZone =
        TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague");

    private readonly RoutesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("routes/common");
        Description(builder => builder
            .WithName(nameof(ListCommonRoutesEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        AllowAnonymous();

        Summary(s =>
        {
            s.Summary = "List common routes (anonymous, fleet-scoped)";
            s.Description = "Anonymous endpoint for the customer PWA Home screen before login. The fleet is " +
                            "resolved from the X-Fleet-Slug header or subdomain by the tenant middleware. " +
                            "Returns enabled, non-deleted fixed-price routes for the fleet. With validNow=true, " +
                            "only routes valid at the current Europe/Prague time are returned. PointToPoint routes " +
                            "include pickup/dropoff coordinates + addresses.";
            s.Responses[StatusCodes.Status200OK] = "The common routes (may be empty).";
            s.Responses[StatusCodes.Status404NotFound] = "No fleet resolved for the request (unknown or missing slug).";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(ListCommonRoutesRequest req, CancellationToken ct)
    {
        // Guard: no fleet resolved → 404 (no unscoped query), same contract as public/fleet + public/track.
        if (currentTenant.FleetId is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        // Tenant-scoped, enabled, non-deleted routes (ordered by priority).
        var routes = await dbContext.Routes.AsNoTracking()
            .Where(r => r.IsEnabled && r.DeletedAt == null)
            .OrderByDescending(r => r.Priority)
            .Select(r => new
            {
                r.Id,
                r.Name,
                r.Type,
                r.PriceCzk,
                r.FromLat,
                r.FromLng,
                r.ToLat,
                r.ToLng,
                r.FromZoneId,
                r.ToZoneId,
                r.ValidDays,
                r.ValidFromTime,
                r.ValidToTime
            })
            .ToListAsync(ct);

        if (req.ValidNow)
        {
            var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(timeProvider.GetUtcNow().UtcDateTime, PragueZone);
            var nowTime = TimeOnly.FromDateTime(nowLocal);
            var dayBit = DayBit(nowLocal.DayOfWeek);

            routes = routes
                .Where(r => (r.ValidDays & dayBit) == dayBit && IsWithinWindow(r.ValidFromTime, r.ValidToTime, nowTime))
                .ToList();
        }

        var dtos = routes
            .Select(r => r.Type == RouteType.PointToPoint
                // Dropoff address is only surfaced when BOTH dropoff coords exist — otherwise the customer
                // create-order validator (DropoffLat/Lng NotNull When DropoffAddress is not null) would 400.
                ? new CommonRouteDto(
                    r.Id, r.Name, r.Type.ToString(), r.PriceCzk,
                    PickupAddress: r.Name,
                    PickupLat: r.FromLat,
                    PickupLng: r.FromLng,
                    DropoffAddress: r.ToLat is not null && r.ToLng is not null ? r.Name : null,
                    DropoffLat: r.ToLat,
                    DropoffLng: r.ToLng)
                : new CommonRouteDto(
                    r.Id, r.Name, r.Type.ToString(), r.PriceCzk,
                    FromZoneId: r.FromZoneId,
                    ToZoneId: r.ToZoneId))
            .ToList();

        await Send.OkAsync(new ListCommonRoutesResponse(dtos), ct);
    }

    private static bool IsWithinWindow(TimeOnly? from, TimeOnly? to, TimeOnly now)
    {
        if (from is null || to is null) return true; // all-day
        return now >= from.Value && now <= to.Value;
    }

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
}
