using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="OrderEvent"/>.</summary>
internal sealed class OrderEventConfiguration : IEntityTypeConfiguration<OrderEvent>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<OrderEvent> builder)
    {
        builder.ToTable("order_events");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Payload).HasColumnType("jsonb");

        builder.HasIndex(x => x.FleetId);
        builder.HasIndex(x => x.OrderId);
        builder.HasIndex(x => x.ActorUserId);
        builder.HasIndex(x => new { x.OrderId, x.At });

        // Audit-merge paging index (UC-007 A1): the unified audit timeline orders by (FleetId, At desc).
        builder.HasIndex(x => new { x.FleetId, x.At });

        // Analytics index (UC-009): funnel and event-type breakdowns filtered by fleet and event type.
        builder.HasIndex(x => new { x.FleetId, x.Type, x.At });

        builder.HasOne<Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Order>().WithMany().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<User>().WithMany().HasForeignKey(x => x.ActorUserId).OnDelete(DeleteBehavior.SetNull);
    }
}
