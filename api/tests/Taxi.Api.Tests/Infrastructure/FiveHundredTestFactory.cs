using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Taxi.Api.Infrastructure.Notifications;

namespace Taxi.Api.Tests.Infrastructure;

/// <summary><see cref="TaxiApiFactory"/> that swaps <see cref="IPushSender"/> for a recording double and
/// pins the ops fleet slug, so the 5xx alerter (A3) can be resolved from DI and driven directly. Each
/// test builds its OWN instance (FakeTime is irreversible; unique slug avoids the shared-container
/// Fleet.Slug uniqueness collision).</summary>
public sealed class FiveHundredTestFactory : TaxiApiFactory
{
    private readonly string _opsSlug;
    private RecordingPushSender? _push;

    /// <summary>The recording push sender the alerter's scope resolves.</summary>
    internal RecordingPushSender Push => _push
        ??= new RecordingPushSender(Services.GetRequiredService<IServiceScopeFactory>());

    /// <summary>Initializes the factory with the shared container connection string and the ops slug to
    /// look up (Ops:FleetSlug).</summary>
    /// <param name="connectionString">The Postgres connection string.</param>
    /// <param name="opsSlug">The unique ops fleet slug for this test.</param>
    public FiveHundredTestFactory(string connectionString, string opsSlug) : base(connectionString)
    {
        _opsSlug = opsSlug;
    }

    /// <inheritdoc />
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);

        builder.UseSetting("Ops:FleetSlug", _opsSlug);

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IPushSender>();
            services.AddScoped<IPushSender>(_ => Push);
        });
    }
}
