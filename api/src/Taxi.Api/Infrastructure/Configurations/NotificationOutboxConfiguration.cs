using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="NotificationOutbox"/>.
/// Indexed on <c>FleetId</c> and <c>(Status, NextAttemptAt)</c> for the dispatch-job scan.</summary>
internal sealed class NotificationOutboxConfiguration : IEntityTypeConfiguration<NotificationOutbox>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<NotificationOutbox> builder)
    {
        builder.ToTable("notification_outbox");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.RecipientPhone).HasMaxLength(20);
        builder.Property(x => x.RecipientEndpoint).HasMaxLength(1000);
        builder.Property(x => x.PayloadJson).HasColumnType("jsonb");

        builder.HasIndex(x => x.FleetId);

        // The dispatch-job scan predicate: Status + NextAttemptAt.
        builder.HasIndex(x => new { x.Status, x.NextAttemptAt });

        builder.HasOne<Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Cascade);
    }
}
