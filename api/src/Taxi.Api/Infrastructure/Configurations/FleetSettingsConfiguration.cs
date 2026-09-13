using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="FleetSettings"/>. The PK is <c>FleetId</c>
/// (1:1 with Fleet) — the value is never generated.</summary>
internal sealed class FleetSettingsConfiguration : IEntityTypeConfiguration<FleetSettings>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<FleetSettings> builder)
    {
        builder.ToTable("fleet_settings");

        builder.HasKey(x => x.FleetId);

        // PK is a FK; value comes from the caller, never generated.
        builder.Property(x => x.FleetId).ValueGeneratedNever();

        builder.Property(x => x.SmsSenderName).HasMaxLength(100);
        builder.Property(x => x.WelcomeText).HasMaxLength(500);

        // SMS cost-cap defaults — HasDefaultValue backfills existing rows on the ADD COLUMN migration.
        builder.Property(x => x.SmsMonthlyCapCzk).HasDefaultValue(500);
        builder.Property(x => x.SmsUnitCostCzk).HasDefaultValue(1);

        builder.HasOne<Fleet>().WithMany().HasForeignKey(x => x.FleetId).OnDelete(DeleteBehavior.Cascade);
    }
}
