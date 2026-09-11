using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;

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

        // Replace TimeProvider with the exposed FakeTimeProvider so tests can advance time.
        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<TimeProvider>(FakeTime);
        });
    }
}
