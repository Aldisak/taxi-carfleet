using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Taxi.Api.Infrastructure.Jobs;
using Taxi.Api.Infrastructure.Notifications;

namespace Taxi.Api.Tests.Infrastructure;

/// <summary><see cref="TaxiApiFactory"/> that swaps the SMS and Push channel adapters for recording
/// test doubles. Time-advancing dispatch-job tests create their OWN instance (FakeTime is irreversible;
/// CLAUDE.md WI-13) and drive <c>NotificationDispatchJob.RunTickAsync</c> directly.</summary>
public sealed class NotificationTestFactory : TaxiApiFactory
{
    /// <summary>The recording SMS sender used by this factory's API container.</summary>
    internal RecordingSmsSender Sms { get; } = new();

    private RecordingPushSender? _push;

    /// <summary>The recording push sender used by this factory's API container.</summary>
    internal RecordingPushSender Push => _push
        ??= new RecordingPushSender(Services.GetRequiredService<IServiceScopeFactory>());

    /// <summary>Initializes the factory with the shared container connection string.</summary>
    /// <param name="connectionString">The Postgres connection string.</param>
    public NotificationTestFactory(string connectionString) : base(connectionString) { }

    /// <inheritdoc />
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);

        builder.ConfigureTestServices(services =>
        {
            // Replace the config-selected senders with recording doubles.
            services.RemoveAll<ISmsSender>();
            services.AddScoped<ISmsSender>(_ => Sms);

            services.RemoveAll<IPushSender>();
            services.AddScoped<IPushSender>(_ => Push);

            // Remove the hosted NotificationDispatchJob ONLY: these tests advance FakeTime and drive
            // RunTickAsync MANUALLY. The PeriodicTimer-based hosted service would otherwise fire extra
            // ticks when FakeTime advances, corrupting deterministic attempt counts.
            var dispatchJob = services.FirstOrDefault(d =>
                d.ServiceType == typeof(IHostedService)
                && d.ImplementationType == typeof(NotificationDispatchJob));
            if (dispatchJob is not null)
                services.Remove(dispatchJob);
        });
    }
}
