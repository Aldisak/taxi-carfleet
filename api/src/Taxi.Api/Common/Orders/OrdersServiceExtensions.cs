namespace Taxi.Api.Common.Orders;

/// <summary>Extension methods for registering order-related services in the DI container.</summary>
internal static class OrdersServiceExtensions
{
    /// <summary>Registers <see cref="OrderService"/> as a scoped service.</summary>
    public static IServiceCollection AddOrders(this IServiceCollection services)
    {
        services.AddScoped<OrderService>();
        return services;
    }
}
