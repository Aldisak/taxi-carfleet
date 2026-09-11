using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="Driver"/>.</summary>
internal sealed class DriverConfiguration : IEntityTypeConfiguration<Driver>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Driver> builder)
    {
        builder.ToTable("drivers");

        builder.HasKey(x => x.Id);

        // FK indexes
        builder.HasIndex(x => x.FleetId);
        builder.HasIndex(x => x.UserId).IsUnique();
        builder.HasIndex(x => x.CurrentVehicleId);

        // Query indexes
        builder.HasIndex(x => new { x.FleetId, x.Status });

        // FK constraints without navigation properties.
        builder.HasOne<Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Vehicle>().WithMany().HasForeignKey(x => x.CurrentVehicleId).OnDelete(DeleteBehavior.SetNull);
    }
}
