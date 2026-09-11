using Microsoft.EntityFrameworkCore;

namespace Taxi.Api.Infrastructure;

/// <summary>Extension methods for configuring <see cref="TaxiDbContext"/> options consistently
/// across runtime (Program.cs) and design-time (<see cref="TaxiDbContextFactory"/>).</summary>
internal static class TaxiDbContextOptionsExtensions
{
    /// <summary>Applies the standard Taxi API database options: Npgsql driver and snake_case naming.</summary>
    /// <param name="options">The options builder to configure.</param>
    /// <param name="connectionString">The Postgres connection string.</param>
    /// <returns>The same <paramref name="options"/> builder for chaining.</returns>
    internal static DbContextOptionsBuilder UseTaxiDb(
        this DbContextOptionsBuilder options, string connectionString) =>
        options
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention();
}
