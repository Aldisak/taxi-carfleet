using Taxi.Api.Common.Geo;

namespace Taxi.Api.Realtime;

/// <summary>Extension methods for registering realtime (SignalR) services in the DI container.</summary>
internal static class RealtimeServiceExtensions
{
    /// <summary>Registers the SignalR-backed <see cref="IRealtimePublisher"/> implementation,
    /// the singleton <see cref="DriverPositionStore"/>, the singleton <see cref="OrderSubscriptionTracker"/>,
    /// and the singleton <see cref="PickupEtaService"/>.</summary>
    public static IServiceCollection AddRealtime(this IServiceCollection services)
    {
        services.AddSingleton<DriverPositionStore>();
        services.AddSingleton<OrderSubscriptionTracker>();
        services.AddSingleton<PickupEtaService>();
        services.AddSingleton<IRealtimePublisher, SignalRRealtimePublisher>();
        return services;
    }
}
