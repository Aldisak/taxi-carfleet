using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.ValueGeneration;

namespace Taxi.Api.Infrastructure;

/// <summary>EF Core value generator that produces UUID version 7 identifiers for entity primary keys.
/// UUIDv7 encodes a sortable timestamp prefix, which improves B-tree index locality.</summary>
internal sealed class GuidV7ValueGenerator : ValueGenerator<Guid>
{
    /// <summary>Gets <see langword="false"/> because each UUIDv7 value is permanent and not replaced on save.</summary>
    public override bool GeneratesTemporaryValues => false;

    /// <inheritdoc />
    public override Guid Next(EntityEntry entry) => Guid.CreateVersion7();
}
