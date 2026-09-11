using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Schema;

/// <summary>Integration tests verifying that the database schema migrations apply cleanly and enforce
/// the expected uniqueness constraints defined in the entity configurations.</summary>
[Collection(TestCollections.Database)]
public sealed class SchemaTests(PostgresFixture fixture)
{
    /// <summary>Verifies that the phone number unique constraint is partial — it only applies to
    /// Customer-role users, not all users. Two customers with the same phone must violate the constraint,
    /// but a customer and a staff user (Driver) sharing a phone must succeed.</summary>
    [Fact]
    public async Task Schema_CustomerPhone_UniqueOnlyForCustomers()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        var phone = "+420777111001";

        await using var scope1 = fixture.Factory.Services.CreateAsyncScope();
        var ctx1 = scope1.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Insert a Customer user.
        var customer1 = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = null,
            Role = UserRole.Customer,
            Phone = phone,
            DisplayName = "Customer One",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        ctx1.Users.Add(customer1);
        await ctx1.SaveChangesAsync(ct);

        // Insert a second Customer with the same phone → should violate unique constraint.
        await using var scope2 = fixture.Factory.Services.CreateAsyncScope();
        var ctx2 = scope2.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var customer2 = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = null,
            Role = UserRole.Customer,
            Phone = phone,
            DisplayName = "Customer Two",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        ctx2.Users.Add(customer2);
        var act1 = async () => await ctx2.SaveChangesAsync(ct);
        var ex1 = await act1.Should().ThrowAsync<DbUpdateException>();
        ex1.Which.InnerException.Should().BeOfType<PostgresException>()
            .Which.SqlState.Should().Be("23505");

        // Insert a Driver user with the same phone → should succeed (partial index does not apply).
        await using var fleet = fixture.Factory.Services.CreateAsyncScope();
        var ctxFleet = fleet.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleetEntity = new Fleet
        {
            Id = fleetId,
            Slug = "test-fleet-phone",
            Name = "Test Fleet Phone",
            Phone = "+420777000000",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        ctxFleet.Fleets.Add(fleetEntity);
        await ctxFleet.SaveChangesAsync(ct);

        await using var scope3 = fixture.Factory.Services.CreateAsyncScope();
        var ctx3 = scope3.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var staffUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            Role = UserRole.Driver,
            Phone = phone,
            Email = "driver@testfleet.local",
            DisplayName = "Driver One",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        ctx3.Users.Add(staffUser);
        await ctx3.SaveChangesAsync(ct);  // Should not throw
    }

    /// <summary>Verifies that the public code unique constraint is scoped per fleet — two orders in the
    /// same fleet with the same public code must violate the constraint, but the same code in two
    /// different fleets must succeed.</summary>
    [Fact]
    public async Task Schema_OrderPublicCode_UniquePerFleet()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet1Id = Guid.CreateVersion7();
        var fleet2Id = Guid.CreateVersion7();
        const string publicCode = "K7F2A9";

        // Create two fleets.
        await using var fleetScope = fixture.Factory.Services.CreateAsyncScope();
        var ctxFleet = fleetScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        ctxFleet.Fleets.AddRange(
            new Fleet { Id = fleet1Id, Slug = "fleet-code-one", Name = "Fleet One", Phone = "+420777001001", Currency = "CZK", TimeZone = "Europe/Prague", IsActive = true, CreatedAt = DateTimeOffset.UtcNow },
            new Fleet { Id = fleet2Id, Slug = "fleet-code-two", Name = "Fleet Two", Phone = "+420777001002", Currency = "CZK", TimeZone = "Europe/Prague", IsActive = true, CreatedAt = DateTimeOffset.UtcNow });
        await ctxFleet.SaveChangesAsync(ct);

        // Insert first order in fleet 1.
        await using var scope1 = fixture.Factory.Services.CreateAsyncScope();
        var ctx1 = scope1.ServiceProvider.GetRequiredService<TaxiDbContext>();
        ctx1.Orders.Add(BuildOrder(fleet1Id, publicCode));
        await ctx1.SaveChangesAsync(ct);

        // Insert second order in fleet 1 with same public code → should violate unique constraint.
        await using var scope2 = fixture.Factory.Services.CreateAsyncScope();
        var ctx2 = scope2.ServiceProvider.GetRequiredService<TaxiDbContext>();
        ctx2.Orders.Add(BuildOrder(fleet1Id, publicCode));
        var act = async () => await ctx2.SaveChangesAsync(ct);
        var ex2 = await act.Should().ThrowAsync<DbUpdateException>();
        ex2.Which.InnerException.Should().BeOfType<PostgresException>()
            .Which.SqlState.Should().Be("23505");

        // Insert an order in fleet 2 with the same public code → should succeed.
        await using var scope3 = fixture.Factory.Services.CreateAsyncScope();
        var ctx3 = scope3.ServiceProvider.GetRequiredService<TaxiDbContext>();
        ctx3.Orders.Add(BuildOrder(fleet2Id, publicCode));
        await ctx3.SaveChangesAsync(ct);  // Should not throw
    }

    /// <summary>Verifies that the email unique constraint for staff users is scoped per fleet — the same
    /// email cannot appear twice in the same fleet, but the same email in two different fleets is allowed.</summary>
    [Fact]
    public async Task Schema_StaffEmail_UniquePerFleet()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet1Id = Guid.CreateVersion7();
        var fleet2Id = Guid.CreateVersion7();
        const string email = "dispatcher@sameemail.test";

        // Create two fleets.
        await using var fleetScope = fixture.Factory.Services.CreateAsyncScope();
        var ctxFleet = fleetScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        ctxFleet.Fleets.AddRange(
            new Fleet { Id = fleet1Id, Slug = "fleet-email-one", Name = "Fleet Email One", Phone = "+420777002001", Currency = "CZK", TimeZone = "Europe/Prague", IsActive = true, CreatedAt = DateTimeOffset.UtcNow },
            new Fleet { Id = fleet2Id, Slug = "fleet-email-two", Name = "Fleet Email Two", Phone = "+420777002002", Currency = "CZK", TimeZone = "Europe/Prague", IsActive = true, CreatedAt = DateTimeOffset.UtcNow });
        await ctxFleet.SaveChangesAsync(ct);

        // Insert dispatcher in fleet 1.
        await using var scope1 = fixture.Factory.Services.CreateAsyncScope();
        var ctx1 = scope1.ServiceProvider.GetRequiredService<TaxiDbContext>();
        ctx1.Users.Add(BuildStaffUser(fleet1Id, email, "dispatcher-a1"));
        await ctx1.SaveChangesAsync(ct);

        // Insert second dispatcher in fleet 1 with same email → should violate unique constraint.
        await using var scope2 = fixture.Factory.Services.CreateAsyncScope();
        var ctx2 = scope2.ServiceProvider.GetRequiredService<TaxiDbContext>();
        ctx2.Users.Add(BuildStaffUser(fleet1Id, email, "dispatcher-a2"));
        var act = async () => await ctx2.SaveChangesAsync(ct);
        var ex3 = await act.Should().ThrowAsync<DbUpdateException>();
        ex3.Which.InnerException.Should().BeOfType<PostgresException>()
            .Which.SqlState.Should().Be("23505");

        // Insert dispatcher in fleet 2 with same email → should succeed.
        await using var scope3 = fixture.Factory.Services.CreateAsyncScope();
        var ctx3 = scope3.ServiceProvider.GetRequiredService<TaxiDbContext>();
        ctx3.Users.Add(BuildStaffUser(fleet2Id, email, "dispatcher-b1"));
        await ctx3.SaveChangesAsync(ct);  // Should not throw
    }

    /// <summary>Verifies that the fleet slug unique constraint prevents two fleets from sharing the same slug.</summary>
    [Fact]
    public async Task Schema_FleetSlug_Unique()
    {
        var ct = TestContext.Current.CancellationToken;
        const string slug = "unique-slug-test";

        await using var scope1 = fixture.Factory.Services.CreateAsyncScope();
        var ctx1 = scope1.ServiceProvider.GetRequiredService<TaxiDbContext>();
        ctx1.Fleets.Add(new Fleet { Id = Guid.CreateVersion7(), Slug = slug, Name = "Fleet Slug One", Phone = "+420777003001", Currency = "CZK", TimeZone = "Europe/Prague", IsActive = true, CreatedAt = DateTimeOffset.UtcNow });
        await ctx1.SaveChangesAsync(ct);

        await using var scope2 = fixture.Factory.Services.CreateAsyncScope();
        var ctx2 = scope2.ServiceProvider.GetRequiredService<TaxiDbContext>();
        ctx2.Fleets.Add(new Fleet { Id = Guid.CreateVersion7(), Slug = slug, Name = "Fleet Slug Two", Phone = "+420777003002", Currency = "CZK", TimeZone = "Europe/Prague", IsActive = true, CreatedAt = DateTimeOffset.UtcNow });
        var act = async () => await ctx2.SaveChangesAsync(ct);
        var ex4 = await act.Should().ThrowAsync<DbUpdateException>();
        ex4.Which.InnerException.Should().BeOfType<PostgresException>()
            .Which.SqlState.Should().Be("23505");
    }

    /// <summary>Verifies that EF Core migrations apply cleanly against a fresh database — no pending
    /// migrations after the fixture has initialized.</summary>
    [Fact]
    public async Task Schema_Migration_AppliesCleanly()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var ctx = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var pending = await ctx.Database.GetPendingMigrationsAsync(ct);
        pending.Should().BeEmpty("all migrations should have been applied by the fixture");
    }

    private static Order BuildOrder(Guid fleetId, string publicCode) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        PublicCode = publicCode,
        Status = OrderStatus.New,
        Source = OrderSource.Dispatcher,
        CustomerPhone = "+420777000001",
        PickupAddress = "Test Street 1",
        PickupLat = 49.9,
        PickupLng = 15.2,
        Passengers = 1,
        PriceType = PriceType.Estimate,
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
        Version = 0
    };

    private static int _staffPhoneSeq;

    private static User BuildStaffUser(Guid fleetId, string email, string suffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.Dispatcher,
        Email = email,
        Phone = $"+4207770099{System.Threading.Interlocked.Increment(ref _staffPhoneSeq):D2}",
        DisplayName = $"Dispatcher {suffix}",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };
}
