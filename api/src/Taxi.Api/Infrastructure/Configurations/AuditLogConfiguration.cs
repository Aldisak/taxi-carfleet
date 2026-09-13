using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="AuditLog"/>.</summary>
internal sealed class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<AuditLog> builder)
    {
        builder.ToTable("audit_logs");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Entity).IsRequired().HasMaxLength(100);
        builder.Property(x => x.Action).IsRequired().HasMaxLength(50);
        builder.Property(x => x.Diff).HasColumnType("jsonb");

        builder.HasIndex(x => x.FleetId);
        builder.HasIndex(x => x.ActorUserId);
        builder.HasIndex(x => x.EntityId);

        // Audit-merge paging index (UC-007 A1): the unified audit timeline orders by (FleetId, At desc).
        builder.HasIndex(x => new { x.FleetId, x.At });

        builder.HasOne<Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<User>().WithMany().HasForeignKey(x => x.ActorUserId).OnDelete(DeleteBehavior.SetNull);
    }
}
