using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Seed;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Seed;

/// <summary>Tests for seed data creation, idempotence, end-to-end flow, and OpenAPI document completeness.</summary>
[Collection(TestCollections.Database)]
public sealed class SeedAndEndToEndTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    // ── Seed test ─────────────────────────────────────────────────────────────

    /// <summary>Verifies that <see cref="DevelopmentSeeder"/> creates the full demo fleet graph
    /// and that running it twice produces no duplicates (idempotence).</summary>
    [Fact]
    public async Task Seed_Development_CreatesDemoFleetGraph()
    {
        var ct = TestContext.Current.CancellationToken;

        // Run seeder once.
        await RunSeederAsync(ct);

        // Assert full graph.
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleet = await db.Fleets.AsNoTracking().FirstOrDefaultAsync(f => f.Slug == "demo", ct);
        fleet.Should().NotBeNull("demo fleet must exist");
        fleet!.Name.Should().Be("Taxi Demo Kolín");

        // FleetSettings
        var settings = await db.FleetSettings.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(fs => fs.FleetId == fleet.Id, ct);
        settings.Should().NotBeNull("FleetSettings row must exist");

        // 1 FleetAdmin + 1 Dispatcher + 3 Drivers = 5 staff users in the fleet
        var staffUsers = await db.Users.IgnoreQueryFilters().AsNoTracking()
            .Where(u => u.FleetId == fleet.Id)
            .ToListAsync(ct);
        staffUsers.Should().HaveCount(5, "1 FleetAdmin + 1 Dispatcher + 3 Drivers");

        var adminUser = staffUsers.FirstOrDefault(u => u.Email == "admin@demo.local");
        adminUser.Should().NotBeNull("FleetAdmin user must exist");
        adminUser!.Role.Should().Be(UserRole.FleetAdmin);

        var dispatcherUser = staffUsers.FirstOrDefault(u => u.Email == "dispatcher@demo.local");
        dispatcherUser.Should().NotBeNull("Dispatcher user must exist");
        dispatcherUser!.Role.Should().Be(UserRole.Dispatcher);

        // 3 Drivers
        var driverUsers = staffUsers.Where(u => u.Role == UserRole.Driver).ToList();
        driverUsers.Should().HaveCount(3, "3 driver users");
        var driver1User = staffUsers.FirstOrDefault(u => u.Email == "driver1@demo.local");
        driver1User.Should().NotBeNull("driver1 user must have a known email");

        // 3 Driver rows
        var drivers = await db.Drivers.IgnoreQueryFilters().AsNoTracking()
            .Where(d => d.FleetId == fleet.Id)
            .ToListAsync(ct);
        drivers.Should().HaveCount(3, "3 Driver rows");

        // 3 Vehicles
        var vehicles = await db.Vehicles.IgnoreQueryFilters().AsNoTracking()
            .Where(v => v.FleetId == fleet.Id)
            .ToListAsync(ct);
        vehicles.Should().HaveCount(3, "3 Vehicles");

        // 1 Tariff
        var tariffs = await db.Tariffs.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.FleetId == fleet.Id)
            .ToListAsync(ct);
        tariffs.Should().HaveCount(1, "1 default Tariff");
        var tariff = tariffs[0];
        tariff.BaseFareCzk.Should().Be(40);
        tariff.PerKmCzk.Should().Be(28);
        tariff.PerMinuteWaitingCzk.Should().Be(5);
        tariff.MinimumFareCzk.Should().Be(100);
        tariff.IsDefault.Should().BeTrue();

        // 2 Zones
        var zones = await db.Zones.IgnoreQueryFilters().AsNoTracking()
            .Where(z => z.FleetId == fleet.Id)
            .ToListAsync(ct);
        zones.Should().HaveCount(2, "2 Zones (KH + Kolín)");
        zones.Should().Contain(z => z.Name == "Kutná Hora", "KH zone must exist");
        zones.Should().Contain(z => z.Name == "Kolín", "Kolín zone must exist");

        // 3 Routes
        var routes = await db.Routes.IgnoreQueryFilters().AsNoTracking()
            .Where(r => r.FleetId == fleet.Id && r.DeletedAt == null)
            .ToListAsync(ct);
        routes.Should().HaveCount(3, "3 Routes");

        // 5 seeded Orders — filter by fixed public codes so E2E-created orders don't pollute the count.
        var demoPublicCodes = new[] { "DEMO01", "DEMO02", "DEMO03", "DEMO04", "DEMO05" };
        var orders = await db.Orders.IgnoreQueryFilters().AsNoTracking()
            .Where(o => o.FleetId == fleet.Id && demoPublicCodes.Contains(o.PublicCode))
            .ToListAsync(ct);
        orders.Should().HaveCount(5, "exactly 5 seeded orders with DEMO01-DEMO05 public codes");
        orders.Select(o => o.PublicCode).Should().BeEquivalentTo(demoPublicCodes);

        // Check states are varied (not all New)
        orders.Should().Contain(o => o.Status == OrderStatus.New);
        orders.Should().Contain(o => o.Status == OrderStatus.Assigned);
        orders.Should().Contain(o => o.Status == OrderStatus.Completed);

        // Run seeder again — idempotent.
        await RunSeederAsync(ct);

        // Should still have exactly 5 seeded orders (filter by fixed codes to exclude E2E-created ones).
        var ordersAfterSecondRun = await db.Orders.IgnoreQueryFilters().AsNoTracking()
            .Where(o => o.FleetId == fleet.Id && demoPublicCodes.Contains(o.PublicCode))
            .ToListAsync(ct);
        ordersAfterSecondRun.Should().HaveCount(5, "seeder is idempotent — no DEMO01-DEMO05 duplicates on second run");
    }

    // ── End-to-end test ───────────────────────────────────────────────────────

    /// <summary>Full dispatcher-creates-assigns / driver-accepts-arrives-starts-completes flow
    /// using real HTTP calls and seeded credentials. Verifies events are recorded in order.</summary>
    [Fact]
    public async Task EndToEnd_DispatcherCreatesAssign_DriverAcceptArriveStartComplete_EventsRecorded()
    {
        var ct = TestContext.Current.CancellationToken;

        // Ensure the demo fleet exists.
        await RunSeederAsync(ct);

        // Use a dedicated factory with the LifetimeValidator clock workaround so that
        // JwtIssuer (using FakeTimeProvider) mints tokens that JwtBearer accepts.
        await using var e2eFactory = new E2ETaxiApiFactory(fixture.ConnectionString);
        var client = e2eFactory.CreateClient();

        // ── 1. Dispatcher logs in with seeded credentials ─────────────────────
        var loginResponse = await client.PostAsJsonAsync("/api/v1/auth/staff/login", new
        {
            fleetSlug = "demo",
            email = "dispatcher@demo.local",
            password = "Demo1234!"
        }, ct);
        loginResponse.StatusCode.Should().Be(HttpStatusCode.OK, "dispatcher login must succeed");

        var loginBody = await loginResponse.Content.ReadFromJsonAsync<JsonElement>(ct);
        var accessToken = loginBody.GetProperty("accessToken").GetString()!;
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

        // ── 2. Create an order ────────────────────────────────────────────────
        var createOrderResponse = await client.PostAsJsonAsync("/api/v1/orders", new
        {
            customerPhone = "+420600111222",
            customerName = "E2E Test Customer",
            pickupAddress = "Náměstí Republiky, Kolín",
            pickupLat = 50.0281,
            pickupLng = 15.2006,
            dropoffAddress = "Kutná Hora centrum",
            dropoffLat = 49.9481,
            dropoffLng = 15.2681,
            passengers = 1,
            priceType = "Estimate"
        }, ct);
        createOrderResponse.StatusCode.Should().Be(HttpStatusCode.Created, "order creation must succeed");

        var createBody = await createOrderResponse.Content.ReadFromJsonAsync<JsonElement>(ct);
        var orderId = Guid.Parse(createBody.GetProperty("order").GetProperty("id").GetString()!);

        // ── 3. Get the seeded driver1 who has a vehicle (already Free from seeder) ──
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleet = await db.Fleets.AsNoTracking().FirstAsync(f => f.Slug == "demo", ct);
        var driver1User = await db.Users.IgnoreQueryFilters().AsNoTracking()
            .FirstAsync(u => u.FleetId == fleet.Id && u.Email == "driver1@demo.local", ct);
        var driver1 = await db.Drivers.IgnoreQueryFilters().AsNoTracking()
            .FirstAsync(d => d.UserId == driver1User.Id, ct);

        // ── 4. Driver logs in ─────────────────────────────────────────────────
        var driverLoginResponse = await client.PostAsJsonAsync("/api/v1/auth/staff/login", new
        {
            fleetSlug = "demo",
            email = "driver1@demo.local",
            password = "Demo1234!"
        }, ct);
        driverLoginResponse.StatusCode.Should().Be(HttpStatusCode.OK, "driver login must succeed");

        var driverLoginBody = await driverLoginResponse.Content.ReadFromJsonAsync<JsonElement>(ct);
        var driverAccessToken = driverLoginBody.GetProperty("accessToken").GetString()!;

        // Note: driver1 is already seeded as Free (online with vehicle1). No need to call GoOnline.
        // The seeder sets driver.Status = Free directly (only order.Status is restricted to OrderService).

        // ── 5. Dispatcher assigns the order to driver1 ────────────────────────
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
        var assignResponse = await client.PostAsJsonAsync($"/api/v1/orders/{orderId}/assign", new
        {
            driverId = driver1.Id
        }, ct);
        assignResponse.StatusCode.Should().Be(HttpStatusCode.OK, "assign must succeed");

        // ── 6. Driver accepts ─────────────────────────────────────────────────
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", driverAccessToken);
        var acceptResponse = await client.PostAsync($"/api/v1/orders/{orderId}/accept", null, ct);
        acceptResponse.StatusCode.Should().Be(HttpStatusCode.OK, "accept must succeed");

        // ── 7. Driver arrives ─────────────────────────────────────────────────
        var arriveResponse = await client.PostAsync($"/api/v1/orders/{orderId}/arrive", null, ct);
        arriveResponse.StatusCode.Should().Be(HttpStatusCode.OK, "arrive must succeed");

        // ── 8. Driver starts ──────────────────────────────────────────────────
        var startResponse = await client.PostAsync($"/api/v1/orders/{orderId}/start", null, ct);
        startResponse.StatusCode.Should().Be(HttpStatusCode.OK, "start must succeed");

        // ── 9. Driver completes ───────────────────────────────────────────────
        var completeResponse = await client.PostAsJsonAsync($"/api/v1/orders/{orderId}/complete", new
        {
            finalPriceCzk = 250,
            paymentType = "Cash"
        }, ct);
        completeResponse.StatusCode.Should().Be(HttpStatusCode.OK, "complete must succeed");

        // ── 10. Dispatcher fetches events and verifies the sequence ───────────
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
        var eventsResponse = await client.GetAsync($"/api/v1/orders/{orderId}/events", ct);
        eventsResponse.StatusCode.Should().Be(HttpStatusCode.OK, "get events must succeed");

        var eventsBody = await eventsResponse.Content.ReadFromJsonAsync<JsonElement>(ct);
        var events = eventsBody.GetProperty("events").EnumerateArray().ToList();

        var eventTypes = events.Select(e => e.GetProperty("type").GetString()).ToList();
        eventTypes.Should().Equal("Created", "Assigned", "Accepted", "Arrived", "Started", "Completed");
    }

    // ── OpenAPI tests ─────────────────────────────────────────────────────────

    /// <summary>Generates <c>docs/api.md</c> from the live OpenAPI document.
    /// Overwrites the file on every run so it never drifts from the actual endpoints.
    /// The repo root is located by walking up from <c>AppContext.BaseDirectory</c>
    /// until the directory containing <c>Taxi.sln</c> is found, then ascending one more level.</summary>
    [Fact]
    public async Task OpenApi_Document_GeneratesApiMarkdown()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = fixture.Factory.CreateClient();

        var response = await client.GetAsync("/swagger/v1/swagger.json", ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK, "swagger.json must be served in Development");

        var json = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        var paths = json.GetProperty("paths");

        // Group operations by first tag (feature area).
        var byTag = new SortedDictionary<string, List<(string Method, string Path, string Summary, bool HasSecurity)>>();

        foreach (var pathEntry in paths.EnumerateObject())
        {
            foreach (var opEntry in pathEntry.Value.EnumerateObject())
            {
                var op = opEntry.Value;
                var summary = op.TryGetProperty("summary", out var sumEl) ? sumEl.GetString() ?? "" : "";
                var tag = op.TryGetProperty("tags", out var tagsEl) &&
                          tagsEl.GetArrayLength() > 0
                    ? tagsEl[0].GetString() ?? "Other"
                    : "Other";
                var hasSecurity = op.TryGetProperty("security", out var secEl) && secEl.GetArrayLength() > 0;

                if (!byTag.TryGetValue(tag, out var list))
                {
                    list = new List<(string, string, string, bool)>();
                    byTag[tag] = list;
                }
                list.Add((opEntry.Name.ToUpperInvariant(), pathEntry.Name, summary, hasSecurity));
            }
        }

        // Build markdown.
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("# Taxi API — Endpoint Reference");
        sb.AppendLine();
        sb.AppendLine("Generated automatically by `OpenApi_Document_GeneratesApiMarkdown` in");
        sb.AppendLine("`api/tests/Taxi.Api.Tests/Seed/SeedAndEndToEndTests.cs`.");
        sb.AppendLine("Do not edit by hand — run the tests to regenerate.");
        sb.AppendLine();
        sb.AppendLine("Base path: `/api/v1` (all routes below are relative to this prefix)");
        sb.AppendLine();
        sb.AppendLine("---");

        foreach (var (tag, ops) in byTag)
        {
            sb.AppendLine();
            sb.AppendLine($"## {tag}");
            sb.AppendLine();
            sb.AppendLine("| Method | Route | Summary | Auth |");
            sb.AppendLine("|--------|-------|---------|------|");
            // Strip /api/v1 prefix for brevity in the table.
            foreach (var (method, path, summary, hasSecurity) in ops)
            {
                var displayPath = path.StartsWith("/api/v1", StringComparison.OrdinalIgnoreCase)
                    ? path["/api/v1".Length..]
                    : path;
                var auth = hasSecurity ? "Bearer" : "Anonymous";
                sb.AppendLine($"| {method} | `{displayPath}` | {summary} | {auth} |");
            }
        }

        sb.AppendLine();
        sb.AppendLine("---");
        sb.AppendLine();
        sb.AppendLine("## Error codes");
        sb.AppendLine();
        sb.AppendLine("All validation errors return 400 with a `problems` array. Error codes follow the pattern " +
                      "`\"Domain.ErrorName\"` (e.g., `\"Validation.PhoneInvalid\"`, `\"Order.NotFound\"`).");
        sb.AppendLine();
        sb.AppendLine("## Concurrency");
        sb.AppendLine();
        sb.AppendLine("Transition endpoints return 409 with code `\"Order.StaleVersion\"` when a concurrent " +
                      "modification is detected. Clients should refetch and retry.");
        sb.AppendLine();
        sb.AppendLine("## Tenant isolation");
        sb.AppendLine();
        sb.AppendLine("All fleet-owned resources (orders, drivers, vehicles, staff) are scoped to the " +
                      "authenticated user's fleet. Cross-tenant reads return 404, never 403 (no existence leak).");

        // Locate the repo root: walk up from AppContext.BaseDirectory until we find a directory
        // containing Taxi.sln, then go one level higher to the repository root.
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        DirectoryInfo? solutionDir = null;
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "Taxi.sln")))
            {
                solutionDir = dir;
                break;
            }
            dir = dir.Parent;
        }

        solutionDir.Should().NotBeNull("could not locate Taxi.sln by walking up from AppContext.BaseDirectory");

        var repoRoot = solutionDir!.Parent!.FullName;
        var docsDir = Path.Combine(repoRoot, "docs");
        Directory.CreateDirectory(docsDir);

        var apiMdPath = Path.Combine(docsDir, "api.md");
        await File.WriteAllTextAsync(apiMdPath, sb.ToString(), ct);
    }

    /// <summary>Verifies the OpenAPI document exposes every expected endpoint by matching an explicit
    /// (verb, path) list. Fails with a missing/extra diff so a dropped FeatureConfiguration is caught.</summary>
    [Fact]
    public async Task OpenApi_Document_ListsAllExpectedEndpoints()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = fixture.Factory.CreateClient();

        var response = await client.GetAsync("/swagger/v1/swagger.json", ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK, "swagger.json must be served in Development");

        var json = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        var paths = json.GetProperty("paths");

        var actualRoutes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in paths.EnumerateObject())
        {
            foreach (var method in path.Value.EnumerateObject())
            {
                actualRoutes.Add($"{method.Name.ToUpperInvariant()} {path.Name}");
            }
        }

        // Explicit expected list — every (verb, route) pair including the api/v1 prefix.
        var expected = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            // Auth
            "POST /api/v1/auth/staff/login",
            "POST /api/v1/auth/customer/request-code",
            "POST /api/v1/auth/customer/verify-code",
            "POST /api/v1/auth/refresh",
            "POST /api/v1/auth/logout",
            // Orders — CRUD
            "POST /api/v1/orders",
            "GET /api/v1/orders",
            "GET /api/v1/orders/{id}",
            "PATCH /api/v1/orders/{id}",
            // Orders — tracking / notes / events
            "GET /api/v1/orders/by-code/{publicCode}",
            "POST /api/v1/orders/{id}/notes",
            "GET /api/v1/orders/{id}/events",
            // Orders — transitions
            "POST /api/v1/orders/{id}/assign",
            "POST /api/v1/orders/{id}/reassign",
            "POST /api/v1/orders/{id}/accept",
            "POST /api/v1/orders/{id}/decline",
            "POST /api/v1/orders/{id}/arrive",
            "POST /api/v1/orders/{id}/start",
            "POST /api/v1/orders/{id}/complete",
            "POST /api/v1/orders/{id}/cancel",
            // Drivers
            "GET /api/v1/drivers",
            "GET /api/v1/drivers/me",
            "POST /api/v1/drivers/me/online",
            "POST /api/v1/drivers/me/offline",
            "POST /api/v1/drivers/{id}/status",
            // Vehicles
            "GET /api/v1/vehicles",
            "GET /api/v1/vehicles/{id}",
            "POST /api/v1/vehicles",
            "PUT /api/v1/vehicles/{id}",
            "DELETE /api/v1/vehicles/{id}",
            // Staff
            "GET /api/v1/staff",
            "GET /api/v1/staff/{id}",
            "POST /api/v1/staff",
            "PUT /api/v1/staff/{id}",
            "DELETE /api/v1/staff/{id}",
            "POST /api/v1/staff/{id}/reset-password",
            // Fleet
            "GET /api/v1/fleet/settings",
            // Geo
            "GET /api/v1/geo/suggest",
            "GET /api/v1/geo/route",
            // Health / welcome
            "GET /api/v1/welcome",
        };

        var missing = expected.Except(actualRoutes, StringComparer.OrdinalIgnoreCase).ToList();
        var extra = actualRoutes.Except(expected, StringComparer.OrdinalIgnoreCase).ToList();

        missing.Should().BeEmpty(
            $"these expected routes are missing from the OpenAPI document:{Environment.NewLine}{string.Join(Environment.NewLine, missing)}");
        extra.Should().BeEmpty(
            $"these unexpected routes appeared in the OpenAPI document:{Environment.NewLine}{string.Join(Environment.NewLine, extra)}");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task RunSeederAsync(CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var seeder = scope.ServiceProvider.GetRequiredService<DevelopmentSeeder>();
        await seeder.SeedAsync(ct);
    }
}

/// <summary>Dedicated factory for the E2E test that applies a <see cref="TokenValidationParameters.LifetimeValidator"/>
/// wired to the factory's <see cref="TaxiApiFactory.FakeTime"/> so that tokens minted by <c>JwtIssuer</c>
/// (which uses the pinned FakeTimeProvider) are accepted by JwtBearer despite the real wall clock
/// being outside the 15-minute window. The FakeTime is never advanced, so background jobs do not age
/// existing orders and contaminate other tests (CLAUDE.md WI-05 clock-trap workaround).</summary>
public sealed class E2ETaxiApiFactory : TaxiApiFactory
{
    /// <summary>Initializes the E2E factory with the given connection string.</summary>
    public E2ETaxiApiFactory(string connectionString) : base(connectionString) { }

    /// <inheritdoc />
    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);

        builder.ConfigureTestServices(services =>
        {
            // Override JWT bearer validation to use the injected FakeTimeProvider for lifetime checks.
            // This allows tokens minted at FakeTime.GetUtcNow() (2026-09-10 12:00 UTC) to be accepted
            // by JwtBearer, which would otherwise validate against real wall-clock time (CLAUDE.md WI-05).
            services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
            {
                var fakeTime = FakeTime;
                options.TokenValidationParameters.LifetimeValidator =
                    (notBefore, expires, _, _) =>
                    {
                        var now = fakeTime.GetUtcNow();
                        return (notBefore == null || notBefore <= now) &&
                               (expires == null || now <= expires);
                    };
            });
        });
    }
}
