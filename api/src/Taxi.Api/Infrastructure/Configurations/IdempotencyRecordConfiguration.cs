using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="IdempotencyRecord"/>.
/// Adds a unique index on <c>(UserId, Key)</c> for claim-then-execute locking,
/// and an index on <c>CreatedAt</c> for the opportunistic purge path.</summary>
internal sealed class IdempotencyRecordConfiguration : IEntityTypeConfiguration<IdempotencyRecord>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<IdempotencyRecord> builder)
    {
        builder.ToTable("idempotency_records");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Key).IsRequired().HasMaxLength(200);
        builder.Property(x => x.RequestHash).IsRequired().HasMaxLength(64);
        builder.Property(x => x.ResponseBody).HasColumnType("jsonb");

        // Unique index on (UserId, Key) — the execution lock for claim-then-execute.
        builder.HasIndex(x => new { x.UserId, x.Key }).IsUnique();

        // Index on CreatedAt for the opportunistic purge (DELETE WHERE CreatedAt < now − 24h).
        builder.HasIndex(x => x.CreatedAt);

        builder.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
