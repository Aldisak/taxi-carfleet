using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="Place"/>.</summary>
internal sealed class PlaceConfiguration : IEntityTypeConfiguration<Place>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Place> builder)
    {
        builder.ToTable("places");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Name).IsRequired().HasMaxLength(200);
        builder.Property(x => x.Address).IsRequired().HasMaxLength(500);

        builder.HasIndex(x => x.FleetId);

        builder.HasOne<Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Restrict);
    }
}
