using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="GeoCacheEntry"/>. Uses a composite PK
/// (FleetId, Kind, Key) — no UUIDv7 generator is applied. No global query filter (mirror RefreshToken/SmsCode).</summary>
internal sealed class GeoCacheEntryConfiguration : IEntityTypeConfiguration<GeoCacheEntry>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<GeoCacheEntry> builder)
    {
        builder.ToTable("geo_cache");

        builder.HasKey(x => new { x.FleetId, x.Kind, x.Key });

        // Kind is stored as string via the global enum-as-string convention; cap the column width.
        builder.Property(x => x.Kind).HasMaxLength(50);

        // Key: normalised query or coordinate hash — cap to a safe upper bound.
        builder.Property(x => x.Key).HasMaxLength(512);

        // Value: JSON blob from the provider — store as native jsonb.
        builder.Property(x => x.Value).HasColumnType("jsonb");

        // Index on CreatedAt to support efficient TTL sweep queries.
        builder.HasIndex(x => x.CreatedAt);

        // Cascade FK to Fleet: removing a fleet removes all its cache entries.
        builder.HasOne<Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Cascade);
    }
}
