using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure.Entities;
using RouteEntity = Taxi.Api.Infrastructure.Entities.Route;

namespace Taxi.Api.Infrastructure.Seed;

/// <summary>Seeds a complete "Taxi Demo Kolín" fleet with sample data for development and demos.
/// <para><b>Idempotent:</b> keyed on fleet slug <c>demo</c> existing — if the demo fleet is found,
/// the seeder skips all inserts. Run it at startup in Development or via a test scope.</para>
/// <para><b>Order creation:</b> the <c>Created</c> event and subsequent transitions are driven through
/// <see cref="OrderService"/> so <c>order.Status</c> is never set directly (assumption 5 in decisions.md).</para>
/// <para><b>Known passwords:</b> <c>admin@demo.local / Demo1234!</c>, <c>dispatcher@demo.local / Demo1234!</c>,
/// and <c>driver1@demo.local / Demo1234!</c> are seeded with known passwords so the E2E acceptance test
/// can perform a real staff login without AuthHelpers. Drivers 2 and 3 have their passwords seeded too.</para>
/// </summary>
internal sealed class DevelopmentSeeder(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<DevelopmentSeeder> logger)
{
    /// <summary>Runs the seed operation. Skips everything if the demo fleet already exists (idempotent).</summary>
    /// <param name="ct">Cancellation token.</param>
    public async Task SeedAsync(CancellationToken ct = default)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Idempotence guard: if the demo fleet exists, skip everything.
        var existing = await db.Fleets.AsNoTracking()
            .FirstOrDefaultAsync(f => f.Slug == "demo", ct);
        if (existing is not null)
        {
            logger.LogDebug("Demo fleet already exists — skipping seed");
            return;
        }

        logger.LogInformation("Seeding development data for demo fleet");

        var now = timeProvider.GetUtcNow();
        var passwordHash = BCrypt.Net.BCrypt.HashPassword("Demo1234!");

        // ── Fleet ────────────────────────────────────────────────────────────
        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = "demo",
            Name = "Taxi Demo Kolín",
            Phone = "+420321700100",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = now
        };
        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);

        // ── FleetSettings ────────────────────────────────────────────────────
        var fleetSettings = new FleetSettings
        {
            FleetId = fleet.Id,
            OfferTimeoutSeconds = 45,
            AutoDispatchEnabled = false,
            AutoDispatchAfterSeconds = 60,
            MaxOfferRadiusKm = 15,
            SmsSenderName = "TaxiDemo"
        };
        db.FleetSettings.Add(fleetSettings);
        await db.SaveChangesAsync(ct);

        // ── FleetAdmin user ──────────────────────────────────────────────────
        var adminUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.FleetAdmin,
            Email = "admin@demo.local",
            PasswordHash = passwordHash,
            Phone = "+420600000001",
            DisplayName = "Demo Admin",
            IsActive = true,
            CreatedAt = now
        };

        // ── Dispatcher user ───────────────────────────────────────────────────
        var dispatcherUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Dispatcher,
            Email = "dispatcher@demo.local",
            PasswordHash = passwordHash,
            Phone = "+420600000002",
            DisplayName = "Demo Dispatcher",
            IsActive = true,
            CreatedAt = now
        };

        // ── Driver users ─────────────────────────────────────────────────────
        var driver1User = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Driver,
            Email = "driver1@demo.local",
            PasswordHash = passwordHash,
            Phone = "+420600000011",
            DisplayName = "Jan Novák",
            IsActive = true,
            CreatedAt = now
        };
        var driver2User = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Driver,
            Email = "driver2@demo.local",
            PasswordHash = passwordHash,
            Phone = "+420600000012",
            DisplayName = "Petr Svoboda",
            IsActive = true,
            CreatedAt = now
        };
        var driver3User = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Driver,
            Email = "driver3@demo.local",
            PasswordHash = passwordHash,
            Phone = "+420600000013",
            DisplayName = "Karel Dvořák",
            IsActive = true,
            CreatedAt = now
        };

        db.Users.AddRange(adminUser, dispatcherUser, driver1User, driver2User, driver3User);
        await db.SaveChangesAsync(ct);

        // ── Vehicles ─────────────────────────────────────────────────────────
        var vehicle1 = new Vehicle
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Plate = "2K1 1234",
            Make = "Škoda",
            Model = "Octavia",
            Color = "Stříbrná",
            Seats = 4,
            IsActive = true
        };
        var vehicle2 = new Vehicle
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Plate = "2K2 5678",
            Make = "Volkswagen",
            Model = "Passat",
            Color = "Černá",
            Seats = 4,
            IsActive = true
        };
        var vehicle3 = new Vehicle
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Plate = "2K3 9012",
            Make = "Toyota",
            Model = "Corolla",
            Color = "Bílá",
            Seats = 4,
            IsActive = true
        };
        db.Vehicles.AddRange(vehicle1, vehicle2, vehicle3);
        await db.SaveChangesAsync(ct);

        // ── Drivers ──────────────────────────────────────────────────────────
        var driver1 = new Driver
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            UserId = driver1User.Id,
            Status = DriverStatus.Free,
            CurrentVehicleId = vehicle1.Id,
            IsActive = true
        };
        var driver2 = new Driver
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            UserId = driver2User.Id,
            Status = DriverStatus.Free,
            CurrentVehicleId = vehicle2.Id,
            IsActive = true
        };
        var driver3 = new Driver
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            UserId = driver3User.Id,
            Status = DriverStatus.Offline,
            IsActive = true
        };
        db.Drivers.AddRange(driver1, driver2, driver3);
        await db.SaveChangesAsync(ct);

        // ── Tariff ───────────────────────────────────────────────────────────
        var tariff = new Tariff
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Name = "Základní tarif",
            BaseFareCzk = 40,
            PerKmCzk = 28,
            PerMinuteWaitingCzk = 5,
            MinimumFareCzk = 100,
            IsDefault = true,
            IsEnabled = true
        };
        db.Tariffs.Add(tariff);
        await db.SaveChangesAsync(ct);

        // ── Zones ────────────────────────────────────────────────────────────
        var zoneKH = new Zone
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Name = "Kutná Hora",
            Shape = ZoneShape.Circle,
            CenterLat = 49.9481,
            CenterLng = 15.2681,
            RadiusMeters = 4000,
            IsEnabled = true
        };
        var zoneKolin = new Zone
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Name = "Kolín",
            Shape = ZoneShape.Circle,
            CenterLat = 50.0281,
            CenterLng = 15.2006,
            RadiusMeters = 4000,
            IsEnabled = true
        };
        db.Zones.AddRange(zoneKH, zoneKolin);
        await db.SaveChangesAsync(ct);

        // ── Places (quick-fill chips + address suggestions) ───────────────────
        db.Places.AddRange(
            new Place
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleet.Id,
                Name = "Nádraží Kolín",
                Lat = 50.0281,
                Lng = 15.2006,
                Address = "Rorejcova, Kolín",
                SortOrder = 0,
                IsEnabled = true
            },
            new Place
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleet.Id,
                Name = "Kutná Hora hl.n.",
                Lat = 49.9556,
                Lng = 15.2731,
                Address = "Nádražní, Kutná Hora",
                SortOrder = 1,
                IsEnabled = true
            },
            new Place
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleet.Id,
                Name = "Kutná Hora město",
                Lat = 49.9481,
                Lng = 15.2681,
                Address = "Palackého náměstí, Kutná Hora",
                SortOrder = 2,
                IsEnabled = true
            },
            new Place
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleet.Id,
                Name = "Nemocnice Kolín",
                Lat = 50.0206,
                Lng = 15.1897,
                Address = "Žižkova 146, Kolín",
                SortOrder = 3,
                IsEnabled = true
            });
        await db.SaveChangesAsync(ct);

        // ── Routes ───────────────────────────────────────────────────────────
        // KH station → KH centre: a PointToPoint fixed 100. Generous radii (500 m) so address-level
        // pickup/dropoff coords near the station and the square both match (A1 default is 150 m).
        var route1 = new RouteEntity
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Name = "Nádraží Kutná Hora → Centrum",
            Type = RouteType.PointToPoint,
            PriceCzk = 100,
            FromLat = 49.9556,
            FromLng = 15.2731,
            ToLat = 49.9481,
            ToLng = 15.2681,
            FromRadiusMeters = 500,
            ToRadiusMeters = 500,
            ValidDays = 127, // Mon-Sun
            Priority = 10,
            IsEnabled = true
        };
        var route2 = new RouteEntity
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Name = "Kdekoli → Kutná Hora",
            Type = RouteType.Zone,
            PriceCzk = 110,
            FromZoneId = zoneKH.Id,
            FromLat = 0,
            FromLng = 0,
            ValidDays = 127,
            Priority = 5,
            IsEnabled = true
        };
        var route3 = new RouteEntity
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Name = "Kutná Hora → Kolín",
            Type = RouteType.ZoneToZone,
            PriceCzk = 300,
            FromZoneId = zoneKH.Id,
            ToZoneId = zoneKolin.Id,
            FromLat = 0,
            FromLng = 0,
            ValidDays = 127,
            Priority = 15,
            IsEnabled = true
        };
        // Night-only route (AC#5): valid only 03:00-04:00 Europe/Prague (a non-wrapping window).
        var route4Night = new RouteEntity
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Name = "Noční příplatek Kutná Hora",
            Type = RouteType.Zone,
            PriceCzk = 200,
            FromZoneId = zoneKH.Id,
            FromLat = 0,
            FromLng = 0,
            ValidDays = 127,
            ValidFromTime = new TimeOnly(3, 0),
            ValidToTime = new TimeOnly(4, 0),
            Priority = 50, // higher than route2 so it wins during its window
            IsEnabled = true
        };
        db.Routes.AddRange(route1, route2, route3, route4Night);
        await db.SaveChangesAsync(ct);

        // ── Sample orders (via OrderService for state transitions) ─────────────
        // Orders are created directly (mirror of CreateOrderEndpoint) then driven through
        // OrderService for transitions per assumption 5 in decisions.md.

        var dispatcherActor = new Actor(dispatcherUser.Id, UserRole.Dispatcher);
        var driver1Actor = new Actor(driver1User.Id, UserRole.Driver, driver1.Id);
        var driver2Actor = new Actor(driver2User.Id, UserRole.Driver, driver2.Id);

        // Order 1: New
        var order1 = CreateOrderEntity(fleet.Id, "DEMO01", OrderStatus.New, "+420777100001", now, dispatcherUser.Id);
        db.Orders.Add(order1);
        db.OrderEvents.Add(MakeCreatedEvent(order1, dispatcherUser.Id, UserRole.Dispatcher, now));
        await db.SaveChangesAsync(ct);

        // Order 2: Assigned — drive to Assigned via OrderService
        var order2 = CreateOrderEntity(fleet.Id, "DEMO02", OrderStatus.New, "+420777100002", now, dispatcherUser.Id);
        db.Orders.Add(order2);
        db.OrderEvents.Add(MakeCreatedEvent(order2, dispatcherUser.Id, UserRole.Dispatcher, now));
        await db.SaveChangesAsync(ct);

        await TransitionViaOrderServiceAsync(fleet.Id, order2.Id,
            OrderTransition.Assign, dispatcherActor,
            new AssignPayload(driver1.Id, vehicle1.Id), ct);

        // Order 3: Accepted — drive to Accepted
        var order3 = CreateOrderEntity(fleet.Id, "DEMO03", OrderStatus.New, "+420777100003", now, dispatcherUser.Id);
        db.Orders.Add(order3);
        db.OrderEvents.Add(MakeCreatedEvent(order3, dispatcherUser.Id, UserRole.Dispatcher, now));
        await db.SaveChangesAsync(ct);

        await TransitionViaOrderServiceAsync(fleet.Id, order3.Id,
            OrderTransition.Assign, dispatcherActor,
            new AssignPayload(driver2.Id, vehicle2.Id), ct);
        await TransitionViaOrderServiceAsync(fleet.Id, order3.Id,
            OrderTransition.Accept, driver2Actor, null, ct);

        // Order 4: InProgress (driver3 → DEMO04).
        // Driver3 was seeded Offline; bring it online with vehicle3 directly (only order.Status is restricted
        // to OrderService — driver.Status may be set directly in the seeder).
        var order4 = CreateOrderEntity(fleet.Id, "DEMO04", OrderStatus.New, "+420777100004", now, dispatcherUser.Id);
        db.Orders.Add(order4);
        db.OrderEvents.Add(MakeCreatedEvent(order4, dispatcherUser.Id, UserRole.Dispatcher, now));
        await db.SaveChangesAsync(ct);

        await using (var driver3Scope = scopeFactory.CreateAsyncScope())
        {
            var driver3Db = driver3Scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var driver3Entity = await driver3Db.Drivers.IgnoreQueryFilters()
                .FirstAsync(d => d.Id == driver3.Id, ct);
            driver3Entity.Status = DriverStatus.Free;
            driver3Entity.CurrentVehicleId = vehicle3.Id;
            await driver3Db.SaveChangesAsync(ct);
        }

        var driver3Actor = new Actor(driver3User.Id, UserRole.Driver, driver3.Id);

        await TransitionViaOrderServiceAsync(fleet.Id, order4.Id,
            OrderTransition.Assign, dispatcherActor,
            new AssignPayload(driver3.Id, vehicle3.Id), ct);
        await TransitionViaOrderServiceAsync(fleet.Id, order4.Id,
            OrderTransition.Accept, driver3Actor, null, ct);
        await TransitionViaOrderServiceAsync(fleet.Id, order4.Id,
            OrderTransition.Arrive, driver3Actor, null, ct);
        await TransitionViaOrderServiceAsync(fleet.Id, order4.Id,
            OrderTransition.Start, driver3Actor, null, ct);

        // Order 5: Completed (driver1 → DEMO05).
        // Driver1 was only Assigned to DEMO02 (Assign does NOT change DriverStatus from Free),
        // so driver1 is still Free and available for DEMO05.
        var order5 = CreateOrderEntity(fleet.Id, "DEMO05", OrderStatus.New, "+420777100005", now, dispatcherUser.Id);
        db.Orders.Add(order5);
        db.OrderEvents.Add(MakeCreatedEvent(order5, dispatcherUser.Id, UserRole.Dispatcher, now));
        await db.SaveChangesAsync(ct);

        await TransitionViaOrderServiceAsync(fleet.Id, order5.Id,
            OrderTransition.Assign, dispatcherActor,
            new AssignPayload(driver1.Id, vehicle1.Id), ct);
        await TransitionViaOrderServiceAsync(fleet.Id, order5.Id,
            OrderTransition.Accept, driver1Actor, null, ct);
        await TransitionViaOrderServiceAsync(fleet.Id, order5.Id,
            OrderTransition.Arrive, driver1Actor, null, ct);
        await TransitionViaOrderServiceAsync(fleet.Id, order5.Id,
            OrderTransition.Start, driver1Actor, null, ct);
        await TransitionViaOrderServiceAsync(fleet.Id, order5.Id,
            OrderTransition.Complete, driver1Actor,
            new CompletePayload(180, PaymentType.Cash), ct);

        logger.LogInformation("Development seed complete — demo fleet {FleetId} created", fleet.Id);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static Order CreateOrderEntity(
        Guid fleetId,
        string publicCode,
        OrderStatus status,
        string customerPhone,
        DateTimeOffset now,
        Guid createdByUserId)
        => new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = publicCode,
            Status = status,
            Source = OrderSource.Dispatcher,
            CustomerPhone = customerPhone,
            CustomerName = "Demo zákazník",
            PickupAddress = "Náměstí Republiky, Kolín",
            PickupLat = 50.0281,
            PickupLng = 15.2006,
            DropoffAddress = "Kutná Hora centrum",
            DropoffLat = 49.9481,
            DropoffLng = 15.2681,
            Passengers = 1,
            PriceType = PriceType.Estimate,
            EstimatedPriceCzk = 200,
            CreatedByUserId = createdByUserId,
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1
        };

    private static OrderEvent MakeCreatedEvent(Order order, Guid actorUserId, UserRole actorRole, DateTimeOffset now)
        => new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = order.FleetId,
            OrderId = order.Id,
            Type = OrderEventType.Created,
            FromStatus = OrderStatus.New,
            ToStatus = OrderStatus.New,
            ActorUserId = actorUserId,
            ActorRole = actorRole,
            At = now
        };

    private async Task TransitionViaOrderServiceAsync(
        Guid fleetId,
        Guid orderId,
        OrderTransition transition,
        Actor actor,
        object? payload,
        CancellationToken ct)
    {
        // Per CLAUDE.md WI-14: each transition must run in its own scope with tenant context set.
        await using var transitionScope = scopeFactory.CreateAsyncScope();
        var tenant = transitionScope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;
        var orderService = transitionScope.ServiceProvider.GetRequiredService<OrderService>();
        var result = await orderService.TransitionAsync(orderId, transition, actor, payload, ct);

        if (!result.IsSuccess)
        {
            throw new InvalidOperationException(
                $"Seed transition {transition} on order {orderId} failed: {result.FailureMessage} (kind={result.FailureKind})");
        }
    }
}
