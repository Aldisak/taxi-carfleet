using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Taxi.Api.Common.Cli;
using Taxi.Api.Infrastructure;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Infra;

/// <summary>Integration test for the <c>migrate</c> CLI subcommand helper
/// (<see cref="CliCommands.RunMigrateAsync"/>). The container DB is already migrated by the fixture,
/// so this asserts the command runs idempotently without throwing (it is a no-op on an up-to-date DB).</summary>
[Collection(TestCollections.Database)]
public sealed class MigrateCommandTests(PostgresFixture fixture)
{
    [Fact]
    public async Task Migrate_AgainstMigratedDb_CompletesWithoutThrowing()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var act = async () => await CliCommands.RunMigrateAsync(dbContext, NullLogger.Instance, ct);

        await act.Should().NotThrowAsync();
    }
}
