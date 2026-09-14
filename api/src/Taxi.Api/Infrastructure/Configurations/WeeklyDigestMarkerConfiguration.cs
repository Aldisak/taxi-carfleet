using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="WeeklyDigestMarker"/>.</summary>
internal sealed class WeeklyDigestMarkerConfiguration : IEntityTypeConfiguration<WeeklyDigestMarker>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<WeeklyDigestMarker> builder)
    {
        builder.ToTable("weekly_digest_markers");

        builder.HasKey(x => x.Id);

        // Unique idempotency constraint: only one digest per fleet per ISO week.
        builder.HasIndex(x => new { x.FleetId, x.IsoYear, x.IsoWeek }).IsUnique();

        builder.HasOne<Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Restrict);
    }
}
