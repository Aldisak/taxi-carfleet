using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="GeoBudgetAlertMarker"/>.</summary>
internal sealed class GeoBudgetAlertMarkerConfiguration : IEntityTypeConfiguration<GeoBudgetAlertMarker>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<GeoBudgetAlertMarker> builder)
    {
        builder.ToTable("geo_budget_alert_markers");

        builder.HasKey(x => x.Id);

        // Unique idempotency constraint: one alert per fleet per calendar month per threshold.
        builder.HasIndex(x => new { x.FleetId, x.Year, x.Month, x.Threshold }).IsUnique();

        builder.HasOne<Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Restrict);
    }
}
