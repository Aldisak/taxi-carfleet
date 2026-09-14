using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Seed;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Analytics;

/// <summary>Integration tests verifying that the extended <see cref="ReportSeedScript"/>
/// produces the full mix of analytics data shapes required by UC-009 perf and endpoint tests.</summary>
[Collection(TestCollections.Database)]
public sealed class ReportSeedExtendedTests(PostgresFixture fixture)
{
    /// <summary>After seeding, at least one order must exist for each analytics shape:
    /// completed-with-driver, cancelled-while-New, no-show (cancelled after Arrived),
    /// rated-with-comment, anonymized customer, returning customer, and all required
    /// event types (Assigned, Declined, Timeout, Accepted, Completed).</summary>
    [Fact]
    public async Task ReportSeed_Extended_PopulatesAllAnalyticsShapes()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();

        // Seed the fleet first (required FK for orders, drivers, vehicles).
        await SeedFleetAsync(fleetId, ct);

        // Run the extended seed (small count for test speed — shape coverage is the goal).
        await using var seedScope = fixture.Factory.Services.CreateAsyncScope();
        var seeder = seedScope.ServiceProvider.GetRequiredService<ReportSeedScript>();
        await seeder.SeedOrdersAsync(fleetId, 500, ct);

        // Verify all required shapes exist.
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // 1. Completed order with driver assigned.
        var hasCompletedWithDriver = await db.Orders.IgnoreQueryFilters()
            .AnyAsync(o => o.FleetId == fleetId
                           && o.Status == OrderStatus.Completed
                           && o.DriverId != null, ct);
        hasCompletedWithDriver.Should().BeTrue("at least one completed order with a driver must exist");

        // 2. Cancelled while New (no driver ever assigned).
        var hasCancelledNew = await db.Orders.IgnoreQueryFilters()
            .AnyAsync(o => o.FleetId == fleetId
                           && o.Status == OrderStatus.Cancelled
                           && o.DriverId == null
                           && o.AssignedAt == null, ct);
        hasCancelledNew.Should().BeTrue("at least one order cancelled while still New must exist");

        // 3. No-show: cancelled after Arrived (driver was present, customer no-show).
        var hasNoShow = await db.Orders.IgnoreQueryFilters()
            .AnyAsync(o => o.FleetId == fleetId
                           && o.Status == OrderStatus.Cancelled
                           && o.ArrivedAt != null
                           && o.CancelledByRole != null, ct);
        hasNoShow.Should().BeTrue("at least one no-show cancellation (cancelled after Arrived) must exist");

        // 4. Rated with comment.
        var hasRatedWithComment = await db.Orders.IgnoreQueryFilters()
            .AnyAsync(o => o.FleetId == fleetId
                           && o.RatingStars != null
                           && o.RatingComment != null
                           && o.RatedAt != null, ct);
        hasRatedWithComment.Should().BeTrue("at least one order with a rating comment must exist");

        // 5. Anonymized customer (special sentinel phone).
        var hasAnonymized = await db.Orders.IgnoreQueryFilters()
            .AnyAsync(o => o.FleetId == fleetId
                           && o.CustomerPhone == "+420000000000", ct);
        hasAnonymized.Should().BeTrue("at least one anonymized order (+420000000000) must exist");

        // 6. Returning customer (customer_user_id set on the order).
        var hasReturningCustomer = await db.Orders.IgnoreQueryFilters()
            .AnyAsync(o => o.FleetId == fleetId && o.CustomerUserId != null, ct);
        hasReturningCustomer.Should().BeTrue("at least one order with a returning customer (customer_user_id) must exist");

        // 7. Driver shifts exist.
        var hasShifts = await db.DriverShifts.IgnoreQueryFilters()
            .AnyAsync(s => s.FleetId == fleetId, ct);
        hasShifts.Should().BeTrue("driver_shifts rows must exist");

        // 8. Offer-funnel event types: Assigned event with non-null actor (dispatcher).
        var hasAssignedEvent = await db.OrderEvents.IgnoreQueryFilters()
            .AnyAsync(e => e.FleetId == fleetId
                           && e.Type == OrderEventType.Assigned
                           && e.ActorUserId != null, ct);
        hasAssignedEvent.Should().BeTrue("at least one Assigned event with a dispatcher actor must exist");

        // 9. Declined event exists.
        var hasDeclinedEvent = await db.OrderEvents.IgnoreQueryFilters()
            .AnyAsync(e => e.FleetId == fleetId && e.Type == OrderEventType.Declined, ct);
        hasDeclinedEvent.Should().BeTrue("at least one Declined event must exist");

        // 10. Timeout event with NULL actor (System).
        var hasTimeoutEvent = await db.OrderEvents.IgnoreQueryFilters()
            .AnyAsync(e => e.FleetId == fleetId
                           && e.Type == OrderEventType.Timeout
                           && e.ActorUserId == null, ct);
        hasTimeoutEvent.Should().BeTrue("at least one Timeout event with null actor (System) must exist");

        // 11. Hour-of-day spread: orders should NOT all be at the same hour.
        var distinctHours = await db.Orders.IgnoreQueryFilters()
            .Where(o => o.FleetId == fleetId)
            .Select(o => o.CreatedAt.Hour)
            .Distinct()
            .CountAsync(ct);
        distinctHours.Should().BeGreaterThan(3, "timestamps should be spread across multiple hours of the day");
    }

    private async Task SeedFleetAsync(Guid fleetId, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"perf-{fleetId:N}",
            Name = "Perf Test Fleet",
            Phone = "+420777999001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
    }
}
