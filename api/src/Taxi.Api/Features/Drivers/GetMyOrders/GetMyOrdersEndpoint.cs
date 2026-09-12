using System.Globalization;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Drivers.GetMyOrders;

/// <summary>Returns the calling driver's own completed and active rides for a given day.</summary>
internal sealed class GetMyOrdersEndpoint(TaxiDbContext dbContext, TimeProvider timeProvider)
    : Endpoint<GetMyOrdersRequest, GetMyOrdersResponse>
{
    private static readonly TimeZoneInfo PragueZone =
        TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague");

    private readonly DriversFeatureConfiguration _featureConfiguration = new();

    // Active (non-terminal) statuses included in the orders list.
    private static readonly OrderStatus[] ActiveStatuses =
    [
        OrderStatus.Assigned,
        OrderStatus.Accepted,
        OrderStatus.Arrived,
        OrderStatus.InProgress
    ];

    /// <inheritdoc />
    public override void Configure()
    {
        Get("drivers/me/orders");
        Description(builder => builder
            .WithName(nameof(GetMyOrdersEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DriverOnly));

        Summary(s =>
        {
            s.Summary = "Get my ride list for a day (Driver only)";
            s.Responses[StatusCodes.Status200OK] = "List of completed and active rides for the day.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid date format.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a driver.";
            s.Responses[StatusCodes.Status404NotFound] = "Driver row not found for the caller.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(GetMyOrdersRequest req, CancellationToken ct)
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

        // Load own completed orders in window + ALL active (non-terminal) orders regardless of date.
        // Active orders represent "today's work in progress" and must always be visible,
        // even if they were created before the query day window (e.g. an order started yesterday
        // that is still in flight).
        var orders = await dbContext.Orders.AsNoTracking()
            .Where(o => o.DriverId == driverId.Value
                     && (
                            // Completed orders with CompletedAt in window.
                            (o.Status == OrderStatus.Completed
                             && o.CompletedAt >= winStart
                             && o.CompletedAt < winEnd)
                            ||
                            // Active (non-terminal) orders — always included, no CreatedAt restriction.
                            ActiveStatuses.Contains(o.Status)
                        ))
            .OrderByDescending(o => o.CompletedAt ?? o.CreatedAt)
            .ToListAsync(ct);

        var dtos = orders.Select(o => new MyOrderDto(
            o.Id,
            o.PublicCode,
            o.Status.ToString(),
            o.PickupAddress,
            o.DropoffAddress,
            o.PriceType.ToString(),
            o.FinalPriceCzk,
            o.PaymentType?.ToString(),
            o.CompletedAt))
            .ToList();

        await Send.OkAsync(new GetMyOrdersResponse(dtos), ct);
    }

    /// <summary>Parses the optional date string and returns the DateOnly for the Europe/Prague day.</summary>
    private DateOnly GetDate(string? dateStr)
    {
        if (dateStr is not null
            && DateOnly.TryParseExact(dateStr, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            return parsed;
        }

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
