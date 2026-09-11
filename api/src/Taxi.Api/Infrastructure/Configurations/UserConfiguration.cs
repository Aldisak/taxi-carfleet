using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="User"/>.</summary>
internal sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("users");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Phone).IsRequired().HasMaxLength(20);
        builder.Property(x => x.DisplayName).IsRequired().HasMaxLength(200);
        builder.Property(x => x.Email).HasMaxLength(200);
        builder.Property(x => x.PasswordHash).HasMaxLength(200);

        // FK index
        builder.HasIndex(x => x.FleetId);

        // Partial unique index: phone is unique only for customers.
        builder.HasIndex(x => x.Phone)
            .IsUnique()
            .HasFilter("role = 'Customer'");

        // Partial unique index: email is unique per fleet when not null.
        builder.HasIndex(x => new { x.FleetId, x.Email })
            .IsUnique()
            .HasFilter("email IS NOT NULL");

        // FK constraint: nullable fleet (null = Customer/SuperAdmin, non-null = fleet staff).
        builder.HasOne<Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Restrict);
    }
}
