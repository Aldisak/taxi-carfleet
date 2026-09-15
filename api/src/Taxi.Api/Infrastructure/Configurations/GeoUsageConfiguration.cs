using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="GeoUsage"/>. Uses a composite PK
/// (FleetId, Day, Kind). No global query filter (mirror RefreshToken/SmsCode).</summary>
internal sealed class GeoUsageConfiguration : IEntityTypeConfiguration<GeoUsage>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<GeoUsage> builder)
    {
        builder.ToTable("geo_usage");

        builder.HasKey(x => new { x.FleetId, x.Day, x.Kind });

        // Day: stored as a native date (no time component).
        builder.Property(x => x.Day).HasColumnType("date");

        // Kind is stored as string via the global enum-as-string convention; cap the column width.
        builder.Property(x => x.Kind).HasMaxLength(50);

        // Cascade FK to Fleet: removing a fleet removes all its usage rows.
        builder.HasOne<Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Cascade);
    }
}
