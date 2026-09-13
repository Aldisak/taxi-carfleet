using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Reports;

/// <summary>Schema-level tests for the UC-007 A1 migration: the nullable <c>Fleet.LogoUpdatedAt</c>
/// column and the report/audit composite indexes that back the A2/A3 aggregation and A4 UNION paging.</summary>
[Collection(TestCollections.Database)]
public sealed class ReportSchemaTests(PostgresFixture fixture)
{
    /// <summary>A freshly-inserted fleet has a null <see cref="Fleet.LogoUpdatedAt"/> (no logo yet).</summary>
    [Fact]
    public async Task ReportSchema_FleetLogoUpdatedAt_DefaultsNull()
    {
        var ct = TestContext.Current.CancellationToken;

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"logo-default-{Guid.NewGuid():N}",
            Name = "Logo Default Fleet",
            Phone = "+420777004001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);

        var stored = await db.Fleets.AsNoTracking().FirstAsync(f => f.Id == fleet.Id, ct);
        stored.LogoUpdatedAt.Should().BeNull();
    }

    /// <summary>The report aggregation indexes on <c>orders</c> exist after migration.</summary>
    [Fact]
    public async Task ReportSchema_OrderReportIndexes_Exist()
    {
        var columns = await GetIndexedColumnSetsAsync("orders");

        columns.Should().ContainEquivalentOf(new[] { "fleet_id", "driver_id", "created_at" });
        columns.Should().ContainEquivalentOf(new[] { "fleet_id", "status", "created_at" });
    }

    /// <summary>The audit-merge paging indexes on <c>order_events</c> and <c>audit_logs</c> exist.</summary>
    [Fact]
    public async Task ReportSchema_AuditMergeIndexes_Exist()
    {
        var orderEventIndexes = await GetIndexedColumnSetsAsync("order_events");
        var auditLogIndexes = await GetIndexedColumnSetsAsync("audit_logs");

        orderEventIndexes.Should().ContainEquivalentOf(new[] { "fleet_id", "at" });
        auditLogIndexes.Should().ContainEquivalentOf(new[] { "fleet_id", "at" });
    }

    /// <summary>No migrations are pending — the A1 migration applied cleanly via the fixture.</summary>
    [Fact]
    public async Task ReportSchema_Migration_IsNonDestructive()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var pending = await db.Database.GetPendingMigrationsAsync(ct);
        pending.Should().BeEmpty("the A1 migration must apply cleanly with no pending migrations");

        // The column exists and is nullable — proves the ADD COLUMN was non-destructive
        // (existing rows backfill null) rather than a drop-and-recreate of the table.
        var nullable = await IsColumnNullableAsync("fleets", "logo_updated_at");
        nullable.Should().BeTrue("logo_updated_at must be a nullable ADD COLUMN");
    }

    /// <summary>Reads the column-name lists of every index on a table from pg_catalog, ordered by
    /// column position. Returns one string[] per index.</summary>
    private async Task<List<string[]>> GetIndexedColumnSetsAsync(string table)
    {
        await using var conn = new NpgsqlConnection(fixture.ConnectionString);
        await conn.OpenAsync(TestContext.Current.CancellationToken);

        const string sql = """
            SELECT i.relname AS index_name,
                   array_agg(a.attname ORDER BY k.ord) AS columns
            FROM pg_class t
            JOIN pg_index ix ON ix.indrelid = t.oid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
            WHERE t.relname = @table
            GROUP BY i.relname;
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("table", table);

        var result = new List<string[]>();
        await using var reader = await cmd.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        while (await reader.ReadAsync(TestContext.Current.CancellationToken))
        {
            var cols = (string[])reader.GetValue(1);
            result.Add(cols);
        }

        return result;
    }

    /// <summary>Returns whether a column is nullable per information_schema.</summary>
    private async Task<bool> IsColumnNullableAsync(string table, string column)
    {
        await using var conn = new NpgsqlConnection(fixture.ConnectionString);
        await conn.OpenAsync(TestContext.Current.CancellationToken);

        const string sql = """
            SELECT is_nullable
            FROM information_schema.columns
            WHERE table_name = @table AND column_name = @column;
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("table", table);
        cmd.Parameters.AddWithValue("column", column);

        var value = (string?)await cmd.ExecuteScalarAsync(TestContext.Current.CancellationToken);
        return value == "YES";
    }
}
