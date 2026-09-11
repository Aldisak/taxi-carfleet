using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Testcontainers.PostgreSql;

namespace Taxi.Api.Tests.Infrastructure;

/// <summary>xUnit collection fixture that starts a shared PostgreSQL 16 Testcontainers container
/// for the entire test suite. The container is started once, shared across all
/// <c>[Collection(<see cref="TestCollections.Database"/>)]</c> test classes, and stopped when
/// the collection is disposed.</summary>
[CollectionDefinition(TestCollections.Database)]
public sealed class PostgresFixture : ICollectionFixture<PostgresFixture>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("taxi_test")
        .WithUsername("postgres")
        .WithPassword("postgres")
        .Build();

    /// <summary>Gets the <see cref="TaxiApiFactory"/> bound to this container's connection string.
    /// Tests obtain an <see cref="System.Net.Http.HttpClient"/> via <c>Factory.CreateClient()</c>.</summary>
    public TaxiApiFactory Factory { get; private set; } = default!;

    /// <summary>Gets the Postgres connection string pointing at the running Testcontainers instance.</summary>
    public string ConnectionString => _container.GetConnectionString();

    /// <inheritdoc />
    public async ValueTask InitializeAsync()
    {
        await _container.StartAsync();
        Factory = new TaxiApiFactory(ConnectionString);
        await InitializeDatabaseAsync();
    }

    /// <summary>Runs EF Core migrations against the container database once after the container starts
    /// and before any test runs. This ensures the schema is in place for all integration tests.</summary>
    private async Task InitializeDatabaseAsync()
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        await dbContext.Database.MigrateAsync();
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        await Factory.DisposeAsync();
        await _container.DisposeAsync();
    }
}
