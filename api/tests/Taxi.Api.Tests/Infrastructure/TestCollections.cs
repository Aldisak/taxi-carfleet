namespace Taxi.Api.Tests.Infrastructure;

/// <summary>Central test collection name constants. Every integration test class must reference one of these
/// via the <c>[Collection]</c> attribute so containers are shared — a missing attribute causes a new
/// container per class (slow and flaky).</summary>
internal static class TestCollections
{
    /// <summary>Collection name for all tests that share the single Postgres container.</summary>
    internal const string Database = "Database";
}
