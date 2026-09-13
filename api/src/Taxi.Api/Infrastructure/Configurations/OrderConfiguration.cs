using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;
using RouteEntity = Taxi.Api.Infrastructure.Entities.Route;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="Order"/>.</summary>
internal sealed class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.ToTable("orders");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.PublicCode).IsRequired().HasMaxLength(6);
        builder.Property(x => x.CustomerPhone).IsRequired().HasMaxLength(20);
        builder.Property(x => x.PickupAddress).IsRequired().HasMaxLength(500);
        builder.Property(x => x.DropoffAddress).HasMaxLength(500);
        builder.Property(x => x.CustomerName).HasMaxLength(200);
        builder.Property(x => x.Note).HasMaxLength(1000);
        builder.Property(x => x.CancelReason).HasMaxLength(500);
        builder.Property(x => x.PriceOverrideReason).HasMaxLength(500);

        builder.Property(x => x.Version).IsConcurrencyToken();

        builder.Property(x => x.RatingComment).HasMaxLength(500);

        // FK indexes
        builder.HasIndex(x => x.FleetId);
        builder.HasIndex(x => x.CustomerUserId);
        builder.HasIndex(x => x.DriverId);
        builder.HasIndex(x => x.VehicleId);
        builder.HasIndex(x => x.RouteId);
        builder.HasIndex(x => x.CreatedByUserId);

        // Query indexes
        builder.HasIndex(x => new { x.FleetId, x.Status });
        builder.HasIndex(x => new { x.FleetId, x.ScheduledAt });
        builder.HasIndex(x => new { x.FleetId, x.CreatedAt }).IsDescending(false, true);
        builder.HasIndex(x => new { x.FleetId, x.PublicCode }).IsUnique();

        // Report aggregation indexes (UC-007 A1): driver report and fleet KPIs filter+group
        // by fleet within a date window, often further scoped by driver or status.
        builder.HasIndex(x => new { x.FleetId, x.DriverId, x.CreatedAt });
        builder.HasIndex(x => new { x.FleetId, x.Status, x.CreatedAt });

        // FK constraints without navigation properties.
        builder.HasOne<Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<User>().WithMany().HasForeignKey(x => x.CustomerUserId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne<Driver>().WithMany().HasForeignKey(x => x.DriverId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne<Vehicle>().WithMany().HasForeignKey(x => x.VehicleId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne<RouteEntity>().WithMany().HasForeignKey(x => x.RouteId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne<User>().WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.SetNull);
    }
}
