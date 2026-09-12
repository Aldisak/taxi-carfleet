using System.Globalization;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Drivers.GetMySummary;

/// <summary>Returns the calling driver's daily summary: ride counts, per-payment totals, and hours online.</summary>
internal sealed class GetMySummaryEndpoint(TaxiDbContext dbContext, TimeProvider timeProvider)
    : Endpoint<GetMySummaryRequest, GetMySummaryResponse>
{
    private static readonly TimeZoneInfo PragueZone =
        TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague");

    private readonly DriversFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("drivers/me/summary");
        Description(builder => builder
            .WithName(nameof(GetMySummaryEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DriverOnly));

        Summary(s =>
        {
            s.Summary = "Get my daily summary (Driver only)";
            s.Responses[StatusCodes.Status200OK] = "Daily ride counts, per-payment totals, and hours online.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid date format.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a driver.";
            s.Responses[StatusCodes.Status404NotFound] = "Driver row not found for the caller.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(GetMySummaryRequest req, CancellationToken ct)
    {
        var subClaim = User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subClaim, out var userId))
        { await Send.NotFoundAsync(ct); return; }

        var driverId = await dbContext.Drivers.AsNoTracking()
            .Where(d => d.UserId == userId)
            .Select(d => (Guid?)d.Id)
            .FirstOrDefaultAsync(ct);

        if (driverId is null) { await Send.NotFoundAsync(ct); return; }

        var (winStart, winEnd) = GetDayWindow(req.Date);
        var now = timeProvider.GetUtcNow();

        // Ride counts and per-payment totals for own Completed orders in window.
        var completedOrders = await dbContext.Orders.AsNoTracking()
            .Where(o => o.DriverId == driverId.Value
                     && o.Status == OrderStatus.Completed
                     && o.CompletedAt >= winStart
                     && o.CompletedAt < winEnd)
            .Select(o => new { o.PaymentType, o.FinalPriceCzk })
            .ToListAsync(ct);

        var ridesCount = completedOrders.Count;
        var cashTotal = completedOrders
            .Where(o => o.PaymentType == PaymentType.Cash)
            .Sum(o => o.FinalPriceCzk ?? 0);
        var cardTotal = completedOrders
            .Where(o => o.PaymentType == PaymentType.Card)
            .Sum(o => o.FinalPriceCzk ?? 0);
        var invoiceTotal = completedOrders
            .Where(o => o.PaymentType == PaymentType.Invoice)
            .Sum(o => o.FinalPriceCzk ?? 0);

        // Hours online: sum of overlapping DriverShift durations (incl. open shift) clamped to window.
        var shifts = await dbContext.DriverShifts.AsNoTracking()
            .Where(s => s.DriverId == driverId.Value
                     && s.StartedAt < winEnd
                     && (s.EndedAt == null || s.EndedAt > winStart))
            .Select(s => new { s.StartedAt, s.EndedAt })
            .ToListAsync(ct);

        var hoursOnline = shifts.Sum(s =>
        {
            var start = s.StartedAt > winStart ? s.StartedAt : winStart;
            var end = (s.EndedAt ?? now) < winEnd ? (s.EndedAt ?? now) : winEnd;
            var duration = end - start;
            return duration.TotalHours > 0 ? duration.TotalHours : 0;
        });

        await Send.OkAsync(new GetMySummaryResponse(
            ridesCount,
            cashTotal,
            cardTotal,
            invoiceTotal,
            Math.Round(hoursOnline, 2)), ct);
    }

    /// <summary>Parses the optional date string and returns a UTC [start, end) window for the Europe/Prague day.</summary>
    private DateOnly GetDate(string? dateStr)
    {
        if (dateStr is not null
            && DateOnly.TryParseExact(dateStr, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            return parsed;
        }

        // Absent or invalid → today in Europe/Prague.
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(timeProvider.GetUtcNow().UtcDateTime, PragueZone);
        return DateOnly.FromDateTime(localNow);
    }

    /// <summary>Returns the UTC [start, end) window for the given day string (Europe/Prague).</summary>
    private (DateTimeOffset start, DateTimeOffset end) GetDayWindow(string? dateStr)
    {
        var date = GetDate(dateStr);
        var localStart = date.ToDateTime(TimeOnly.MinValue);
        var localEnd = date.AddDays(1).ToDateTime(TimeOnly.MinValue);
        var utcStart = TimeZoneInfo.ConvertTimeToUtc(localStart, PragueZone);
        var utcEnd = TimeZoneInfo.ConvertTimeToUtc(localEnd, PragueZone);
        return (utcStart, utcEnd);
    }
}
