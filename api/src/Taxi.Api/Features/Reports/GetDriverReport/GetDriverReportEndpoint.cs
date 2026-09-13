using System.Globalization;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Reports;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Reports.GetDriverReport;

/// <summary>Returns a per-Europe/Prague-day aggregated report for one driver over a date range,
/// plus a totals row and the driver's average rating. Supports a byte-exact CSV export via
/// <c>?format=csv</c> (UTF-8 BOM + ';' + CRLF for Czech Excel). FleetAdmin only, tenant-scoped.
/// <para>The per-day aggregation runs entirely in SQL via a FromSql query grouped by a Prague-local
/// day key (<c>date_trunc</c>/<c>AT TIME ZONE</c>) — there is no in-memory grouping of raw order rows.
/// Hours-online is a separate small, window-clamped <c>driver_shifts</c> query, not folded into the
/// group-by.</para></summary>
internal sealed class GetDriverReportEndpoint(TaxiDbContext dbContext, TimeProvider timeProvider)
    : Endpoint<GetDriverReportRequest, GetDriverReportResponse>
{
    private static readonly TimeZoneInfo PragueZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague");

    private readonly ReportsFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("reports/drivers");
        Description(builder => builder
            .WithName(nameof(GetDriverReportEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Driver report (FleetAdmin)";
            s.Description = "Per-Prague-day ride counts, per-payment totals, hours online, price-override " +
                            "count, and average rating for one driver over a date range. ?format=csv returns " +
                            "a UTF-8-BOM ';'-separated CSV for Czech Excel.";
            s.Responses[StatusCodes.Status200OK] = "Driver report (JSON or CSV).";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid driver id, date, or range.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Driver not found in this fleet.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(GetDriverReportRequest req, CancellationToken ct)
    {
        // Tenant-scoped driver lookup (global query filter). Cross-fleet id → not found → 404.
        var driver = await dbContext.Drivers.AsNoTracking()
            .Where(d => d.Id == req.DriverId)
            .Select(d => new { d.Id, d.UserId })
            .FirstOrDefaultAsync(ct);

        if (driver is null) { await Send.NotFoundAsync(ct); return; }

        var driverName = await dbContext.Users.AsNoTracking()
            .Where(u => u.Id == driver.UserId)
            .Select(u => u.DisplayName)
            .FirstOrDefaultAsync(ct) ?? string.Empty;

        var fromDate = DateOnly.ParseExact(req.From!, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var toDate = DateOnly.ParseExact(req.To!, "yyyy-MM-dd", CultureInfo.InvariantCulture);

        var winStart = ToUtc(fromDate);                 // inclusive
        var winEnd = ToUtc(toDate.AddDays(1));           // exclusive (end of the 'to' day)

        var days = await BuildDaysAsync(req.DriverId, fromDate, toDate, winStart, winEnd, ct);
        var avgRating = await ComputeAvgRatingAsync(req.DriverId, winStart, winEnd, ct);
        var totals = BuildTotals(days);

        var response = new GetDriverReportResponse(driver.Id, driverName, avgRating, days, totals);

        if (string.Equals(req.Format, "csv", StringComparison.OrdinalIgnoreCase))
        {
            var bytes = DriverReportCsv.Write(response);
            await Send.BytesAsync(bytes, $"driver-report-{req.DriverId}.csv", "text/csv; charset=utf-8", cancellation: ct);
            return;
        }

        await Send.OkAsync(response, ct);
    }

    /// <summary>Builds the per-day rows: one SQL aggregation for completed/cancelled/payment sums grouped
    /// by Prague day, and one window-clamped driver_shifts query for hours-online merged in memory.</summary>
    private async Task<List<DriverReportDayDto>> BuildDaysAsync(
        Guid driverId, DateOnly fromDate, DateOnly toDate,
        DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        // SQL aggregation grouped by the Prague-local calendar day. All sums/counts are server-side.
        var aggregates = await dbContext.Database.SqlQuery<DriverDayAggregate>(
            $"""
             SELECT (created_at AT TIME ZONE 'Europe/Prague')::date AS "day",
                    COUNT(*) FILTER (WHERE status = 'Completed')::int AS "rides_completed",
                    COUNT(*) FILTER (WHERE status = 'Cancelled' AND cancelled_by_role = 'Driver')::int AS "rides_cancelled",
                    COALESCE(SUM(final_price_czk) FILTER (WHERE status = 'Completed' AND payment_type = 'Cash'), 0)::int AS "cash_czk",
                    COALESCE(SUM(final_price_czk) FILTER (WHERE status = 'Completed' AND payment_type = 'Card'), 0)::int AS "card_czk",
                    COALESCE(SUM(final_price_czk) FILTER (WHERE status = 'Completed' AND payment_type = 'Invoice'), 0)::int AS "invoice_czk",
                    COALESCE(SUM(final_price_czk) FILTER (WHERE status = 'Completed'), 0)::int AS "total_czk",
                    COUNT(*) FILTER (WHERE status = 'Completed' AND price_override_reason IS NOT NULL)::int AS "price_override_count"
             FROM orders
             WHERE fleet_id = (SELECT fleet_id FROM drivers WHERE id = {driverId})
               AND driver_id = {driverId}
               AND created_at >= {winStart}
               AND created_at < {winEnd}
             GROUP BY (created_at AT TIME ZONE 'Europe/Prague')::date
             """).ToListAsync(ct);

        var byDay = aggregates.ToDictionary(a => DateOnly.FromDateTime(a.Day));

        // Hours-online per Prague day: load overlapping shifts once, clamp per-day in memory.
        var now = timeProvider.GetUtcNow();
        var shifts = await dbContext.DriverShifts.AsNoTracking()
            .Where(s => s.DriverId == driverId && s.StartedAt < winEnd && (s.EndedAt == null || s.EndedAt > winStart))
            .Select(s => new { s.StartedAt, s.EndedAt })
            .ToListAsync(ct);

        var days = new List<DriverReportDayDto>();
        for (var date = fromDate; date <= toDate; date = date.AddDays(1))
        {
            var dayStart = ToUtc(date);
            var dayEnd = ToUtc(date.AddDays(1));

            var hours = shifts.Sum(s =>
            {
                var start = s.StartedAt > dayStart ? s.StartedAt : dayStart;
                var end = (s.EndedAt ?? now) < dayEnd ? (s.EndedAt ?? now) : dayEnd;
                var duration = end - start;
                return duration.TotalHours > 0 ? duration.TotalHours : 0;
            });

            byDay.TryGetValue(date, out var agg);
            var hasActivity = agg is not null || hours > 0;
            if (!hasActivity) continue;

            days.Add(new DriverReportDayDto(
                date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                agg?.RidesCompleted ?? 0,
                agg?.RidesCancelled ?? 0,
                agg?.CashCzk ?? 0,
                agg?.CardCzk ?? 0,
                agg?.InvoiceCzk ?? 0,
                agg?.TotalCzk ?? 0,
                Math.Round(hours, 2),
                agg?.PriceOverrideCount ?? 0));
        }

        return days;
    }

    private async Task<double?> ComputeAvgRatingAsync(
        Guid driverId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var avg = await dbContext.Orders.AsNoTracking()
            .Where(o => o.DriverId == driverId
                     && o.Status == OrderStatus.Completed
                     && o.RatingStars != null
                     && o.CreatedAt >= winStart
                     && o.CreatedAt < winEnd)
            .Select(o => (double?)o.RatingStars!.Value)
            .AverageAsync(ct);

        return avg is null ? null : Math.Round(avg.Value, 2);
    }

    private static DriverReportDayDto BuildTotals(IReadOnlyList<DriverReportDayDto> days) =>
        new(
            "Celkem",
            days.Sum(d => d.RidesCompleted),
            days.Sum(d => d.RidesCancelled),
            days.Sum(d => d.CashCzk),
            days.Sum(d => d.CardCzk),
            days.Sum(d => d.InvoiceCzk),
            days.Sum(d => d.TotalCzk),
            Math.Round(days.Sum(d => d.HoursOnline), 2),
            days.Sum(d => d.PriceOverrideCount));

    /// <summary>Converts a Prague calendar day boundary to its UTC instant.</summary>
    private static DateTimeOffset ToUtc(DateOnly pragueDay)
    {
        var local = pragueDay.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, PragueZone), TimeSpan.Zero);
    }

    /// <summary>Row shape for the SQL per-Prague-day aggregate.</summary>
    private sealed record DriverDayAggregate(
        DateTime Day,
        int RidesCompleted,
        int RidesCancelled,
        int CashCzk,
        int CardCzk,
        int InvoiceCzk,
        int TotalCzk,
        int PriceOverrideCount);
}
