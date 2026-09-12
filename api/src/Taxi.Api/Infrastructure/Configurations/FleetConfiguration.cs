using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="Fleet"/>.</summary>
internal sealed class FleetConfiguration : IEntityTypeConfiguration<Fleet>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Fleet> builder)
    {
        builder.ToTable("fleets");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Slug).IsRequired().HasMaxLength(100);
        builder.Property(x => x.Name).IsRequired().HasMaxLength(200);
        builder.Property(x => x.Phone).IsRequired().HasMaxLength(20);
        builder.Property(x => x.Currency).IsRequired().HasMaxLength(3);
        builder.Property(x => x.TimeZone).IsRequired().HasMaxLength(100);
        builder.Property(x => x.PrimaryColorHex).HasMaxLength(7);

        builder.HasIndex(x => x.Slug).IsUnique();
    }
}
