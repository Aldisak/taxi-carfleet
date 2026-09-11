using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Configurations;

/// <summary>EF Core entity type configuration for <see cref="SmsCode"/>.</summary>
internal sealed class SmsCodeConfiguration : IEntityTypeConfiguration<SmsCode>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<SmsCode> builder)
    {
        builder.ToTable("sms_codes");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Phone).IsRequired().HasMaxLength(20);
        builder.Property(x => x.CodeHash).IsRequired().HasMaxLength(100);

        builder.HasIndex(x => x.Phone);
    }
}
