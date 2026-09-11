using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="Entities.Route"/>.</summary>
internal sealed class RouteConfiguration : IEntityTypeConfiguration<Entities.Route>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Entities.Route> builder)
    {
        builder.ToTable("routes");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Name).IsRequired().HasMaxLength(200);

        builder.HasIndex(x => x.FleetId);
        builder.HasIndex(x => x.FromZoneId);
        builder.HasIndex(x => x.ToZoneId);

        builder.HasOne<Entities.Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Entities.Zone>().WithMany().HasForeignKey(x => x.FromZoneId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne<Entities.Zone>().WithMany().HasForeignKey(x => x.ToZoneId).OnDelete(DeleteBehavior.SetNull);
    }
}
