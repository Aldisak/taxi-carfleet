using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="NotificationLog"/>.
/// The UNIQUE index on <c>(FleetId, Event, OrderId, Recipient, Channel)</c> enforces dedup (AC#7)
/// and serves as the send-time claim-then-execute lock. A second index on <c>(FleetId, OrderId)</c>
/// supports the order-detail Notifikace read (A6).</summary>
internal sealed class NotificationLogConfiguration : IEntityTypeConfiguration<NotificationLog>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<NotificationLog> builder)
    {
        builder.ToTable("notification_log");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Recipient).IsRequired().HasMaxLength(1000);
        builder.Property(x => x.ProviderMessageId).HasMaxLength(200);
        builder.Property(x => x.Error).HasMaxLength(200);

        // Dedup + claim-then-execute unique index (AC#7).
        builder.HasIndex(x => new { x.FleetId, x.Event, x.OrderId, x.Recipient, x.Channel }).IsUnique();

        // Order-detail Notifikace read (A6): load the order's notifications tenant-scoped.
        builder.HasIndex(x => new { x.FleetId, x.OrderId });

        builder.HasOne<Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Cascade);
    }
}
