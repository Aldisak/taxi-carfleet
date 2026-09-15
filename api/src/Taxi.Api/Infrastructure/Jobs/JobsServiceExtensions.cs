namespace Taxi.Api.Infrastructure.Jobs;

/// <summary>Extension methods for registering background jobs in the DI container.</summary>
internal static class JobsServiceExtensions
{
    /// <summary>Registers all background jobs as hosted services.
    /// Every job uses a scoped <c>TaxiDbContext</c> per tick via <see cref="IServiceScopeFactory"/>,
    /// and <c>TimeProvider</c> (injectable <c>FakeTimeProvider</c> from the Testing package in tests).
    /// The <c>PeriodicTimer</c> constructor that accepts a <see cref="TimeProvider"/>
    /// is available in .NET 8+ and is used here so time-advancing tests can control the tick rate.
    /// </summary>
    public static IServiceCollection AddJobs(this IServiceCollection services)
    {
        services.AddHostedService<OfferTimeoutJob>();
        services.AddHostedService<StalePositionJob>();
        services.AddHostedService<NotificationDispatchJob>();
        services.AddHostedService<RetentionJob>();
        services.AddHostedService<WeeklyDigestJob>();
        services.AddHostedService<GeoCacheCleanupJob>();
        return services;
    }
}
