using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Taxi.Api.Common.Security;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Integration test verifying that <see cref="IFleetKeyProtector"/> and
/// <see cref="DataProtectionKeyRingGuard"/> are correctly wired into <c>Program.cs</c>.
/// Separate from the isolation tests in <see cref="FleetKeyProtectorTests"/> so this class
/// can carry the <c>[Collection]</c> attribute without pulling the Postgres container into
/// the pure unit tests.</summary>
[Collection(TestCollections.Database)]
public sealed class FleetKeyProtectorWiringTests(PostgresFixture fixture)
{
    /// <summary>Program.cs must register <see cref="IFleetKeyProtector"/> and
    /// <see cref="DataProtectionKeyRingGuard"/> so the DI container can resolve both.
    /// If either registration is dropped, the test fails before any feature code runs.</summary>
    [Fact]
    public void Program_RegistersGuardAndProtector()
    {
        fixture.Factory.Services.GetServices<IHostedService>()
            .Should().Contain(s => s is DataProtectionKeyRingGuard,
                "DataProtectionKeyRingGuard must be registered as an IHostedService in Program.cs");

        fixture.Factory.Services.GetRequiredService<IFleetKeyProtector>()
            .Should().NotBeNull("IFleetKeyProtector must be resolvable from the DI container");
    }
}
