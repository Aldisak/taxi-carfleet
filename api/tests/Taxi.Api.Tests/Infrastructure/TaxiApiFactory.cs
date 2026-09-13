using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Tests.Infrastructure;

/// <summary><see cref="WebApplicationFactory{TProgram}"/> wired to the Testcontainers Postgres container.
/// Overrides the database connection string so the API uses the real test database instead of the
/// dev compose database.</summary>
/// <remarks>
/// <b>FakeTimeProvider hook:</b> individual tests that need to advance time can access
/// <see cref="FakeTime"/> directly on this factory instance and call
/// <c>FakeTime.Advance(...)</c> or <c>FakeTime.SetUtcNow(...)</c>. When tests share the
/// shared <see cref="PostgresFixture.Factory"/>, create a <b>new</b>
/// <see cref="TaxiApiFactory"/> instance instead (clock advances cannot go backwards and
/// would contaminate other tests running against the shared instance).
/// </remarks>
public class TaxiApiFactory : WebApplicationFactory<Program>
{
    private readonly string _connectionString;

    /// <summary>Gets the <see cref="FakeTimeProvider"/> registered in this factory's DI container.
    /// Advance or pin it per-test when using a dedicated factory instance.</summary>
    public FakeTimeProvider FakeTime { get; } =
        new FakeTimeProvider(new DateTimeOffset(2026, 9, 10, 12, 0, 0, TimeSpan.Zero));

    /// <summary>Gets the <see cref="FakeGeoProvider"/> registered in this factory's DI container.
    /// Tests set <see cref="FakeGeoProvider.SuggestResult"/> / <see cref="FakeGeoProvider.RouteResult"/>
    /// before each call to control the geo upstream behaviour without real HTTP calls.</summary>
    public FakeGeoProvider FakeGeo { get; } = new FakeGeoProvider();

    /// <summary>Per-factory temp directory used as the fleet-logo storage root so uploads in tests never
    /// touch the production <c>/data</c> path.</summary>
    public string LogoStorageRoot { get; } =
        Path.Combine(Path.GetTempPath(), "taxi-test-logos", Guid.NewGuid().ToString("N"));

    /// <summary>Initializes the factory with the Postgres container connection string.</summary>
    /// <param name="connectionString">Connection string from <see cref="PostgresFixture.ConnectionString"/>.</param>
    public TaxiApiFactory(string connectionString)
    {
        _connectionString = connectionString;
    }

    /// <inheritdoc />
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Use Development so appsettings.Development.json (JWT dev key, etc.) loads.
        builder.UseEnvironment("Development");

        // Override the database connection to point at the Testcontainers Postgres.
        builder.UseSetting("ConnectionStrings:Db", _connectionString);

        // Disable seed at startup — tests control seeding via DevelopmentSeeder directly.
        builder.UseSetting("Seed:Enabled", "false");

        // Point fleet-logo storage at a per-factory temp dir so tests never write to the prod /data path.
        builder.UseSetting("FleetLogo:StorageRoot", LogoStorageRoot);

        // Replace TimeProvider with the exposed FakeTimeProvider so tests can advance time.
        // Replace IGeoProvider with the FakeGeoProvider so tests avoid real HTTP calls.
        // Register both as the concrete type AND the interface so tests can resolve FakeGeoProvider directly.
        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<TimeProvider>(FakeTime);
            services.AddSingleton(FakeGeo);
            services.AddSingleton<IGeoProvider>(sp => sp.GetRequiredService<FakeGeoProvider>());
        });
    }
}
