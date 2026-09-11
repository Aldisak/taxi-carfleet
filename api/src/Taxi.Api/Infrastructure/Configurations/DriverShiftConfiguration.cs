using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="DriverShift"/>.</summary>
internal sealed class DriverShiftConfiguration : IEntityTypeConfiguration<DriverShift>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<DriverShift> builder)
    {
        builder.ToTable("driver_shifts");

        builder.HasKey(x => x.Id);

        builder.HasIndex(x => x.FleetId);
        builder.HasIndex(x => x.DriverId);
        builder.HasIndex(x => x.VehicleId);

        builder.HasOne<Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Driver>().WithMany().HasForeignKey(x => x.DriverId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Vehicle>().WithMany().HasForeignKey(x => x.VehicleId).OnDelete(DeleteBehavior.Restrict);
    }
}
