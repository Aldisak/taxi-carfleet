using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure;

/// <summary>Design-time factory for <see cref="TaxiDbContext"/>. Used by <c>dotnet ef</c> to create
/// context instances without a running application. A dummy connection string and a null-tenant
/// stub are intentionally used here — the real values are provided at runtime via configuration.</summary>
internal sealed class TaxiDbContextFactory : IDesignTimeDbContextFactory<TaxiDbContext>
{
    /// <inheritdoc />
    public TaxiDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<TaxiDbContext>();
        optionsBuilder.UseTaxiDb("Host=localhost;Port=5432;Database=taxi_design;Username=postgres;Password=postgres");
        var options = optionsBuilder.Options;

        // Null-tenant stub: FleetId = null — no query filters apply, no save-guard fires.
        return new TaxiDbContext(options, new NullCurrentTenant());
    }

    /// <summary>Stub tenant that always returns null — safe for design-time context creation.</summary>
    private sealed class NullCurrentTenant : ICurrentTenant
    {
        /// <inheritdoc />
        public Guid? FleetId => null;

        /// <inheritdoc />
        public string? Slug => null;
    }
}
