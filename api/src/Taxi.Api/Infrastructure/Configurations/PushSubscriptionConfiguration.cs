using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="PushSubscription"/>.</summary>
internal sealed class PushSubscriptionConfiguration : IEntityTypeConfiguration<PushSubscription>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<PushSubscription> builder)
    {
        builder.ToTable("push_subscriptions");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Endpoint).IsRequired().HasMaxLength(2048);
        builder.Property(x => x.P256dh).IsRequired().HasMaxLength(200);
        builder.Property(x => x.Auth).IsRequired().HasMaxLength(200);
        builder.Property(x => x.UserAgent).HasMaxLength(500);

        builder.HasIndex(x => x.FleetId);
        builder.HasIndex(x => x.UserId);

        builder.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Restrict);
    }
}
