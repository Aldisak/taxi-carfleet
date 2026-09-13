using Microsoft.AspNetCore.Authorization;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Authorization;

/// <summary>Authorization policy name constants and registration for all role-based policies.
/// Endpoints reference these via <c>Policies(nameof(AuthorizationPolicies.XYZ))</c>.</summary>
public static class AuthorizationPolicies
{
    /// <summary>Policy that allows only <see cref="UserRole.Customer"/> users.</summary>
    public const string CustomerOnly = nameof(CustomerOnly);

    /// <summary>Policy that allows only <see cref="UserRole.Driver"/> users.</summary>
    public const string DriverOnly = nameof(DriverOnly);

    /// <summary>Policy that allows <see cref="UserRole.Dispatcher"/> or <see cref="UserRole.FleetAdmin"/> users.</summary>
    public const string DispatcherOnly = nameof(DispatcherOnly);

    /// <summary>Policy that allows only <see cref="UserRole.FleetAdmin"/> users.</summary>
    public const string FleetAdminOnly = nameof(FleetAdminOnly);

    /// <summary>Policy that allows only <see cref="UserRole.SuperAdmin"/> users.</summary>
    public const string SuperAdminOnly = nameof(SuperAdminOnly);

    /// <summary>Policy that allows <see cref="UserRole.Dispatcher"/>, <see cref="UserRole.FleetAdmin"/>,
    /// or <see cref="UserRole.Customer"/> users. Used for create-order where both dispatchers and
    /// customers may place orders.</summary>
    public const string DispatcherOrCustomer = nameof(DispatcherOrCustomer);

    /// <summary>Policy that allows <see cref="UserRole.Dispatcher"/>, <see cref="UserRole.FleetAdmin"/>,
    /// or <see cref="UserRole.Driver"/> users. Used for read-only geo queries needed by both
    /// dispatcher UI and driver PWA.</summary>
    public const string DispatcherOrDriver = nameof(DispatcherOrDriver);

    /// <summary>Policy that allows <see cref="UserRole.Customer"/>, <see cref="UserRole.Dispatcher"/>,
    /// or <see cref="UserRole.FleetAdmin"/> users. Used for address autocomplete (geo/suggest),
    /// which the customer PWA needs for pickup entry alongside the dispatcher UI.</summary>
    public const string CustomerOrStaff = nameof(CustomerOrStaff);

    /// <summary>Policy that allows ANY authenticated user regardless of role. Used for push-subscription
    /// management, which every role (Customer/Driver/Dispatcher/FleetAdmin) performs for their own devices.</summary>
    public const string AuthenticatedOnly = nameof(AuthenticatedOnly);

    /// <summary>Registers all authorization policies in the service collection.</summary>
    /// <param name="options">The <see cref="AuthorizationOptions"/> to register policies into.</param>
    public static void RegisterPolicies(AuthorizationOptions options)
    {
        options.AddPolicy(CustomerOnly, policy =>
            policy.RequireAuthenticatedUser()
                  .RequireRole(nameof(UserRole.Customer)));

        options.AddPolicy(DriverOnly, policy =>
            policy.RequireAuthenticatedUser()
                  .RequireRole(nameof(UserRole.Driver)));

        options.AddPolicy(DispatcherOnly, policy =>
            policy.RequireAuthenticatedUser()
                  .RequireRole(nameof(UserRole.Dispatcher), nameof(UserRole.FleetAdmin)));

        options.AddPolicy(FleetAdminOnly, policy =>
            policy.RequireAuthenticatedUser()
                  .RequireRole(nameof(UserRole.FleetAdmin)));

        options.AddPolicy(SuperAdminOnly, policy =>
            policy.RequireAuthenticatedUser()
                  .RequireRole(nameof(UserRole.SuperAdmin)));

        options.AddPolicy(DispatcherOrCustomer, policy =>
            policy.RequireAuthenticatedUser()
                  .RequireRole(
                      nameof(UserRole.Dispatcher),
                      nameof(UserRole.FleetAdmin),
                      nameof(UserRole.Customer)));

        options.AddPolicy(DispatcherOrDriver, policy =>
            policy.RequireAuthenticatedUser()
                  .RequireRole(
                      nameof(UserRole.Dispatcher),
                      nameof(UserRole.FleetAdmin),
                      nameof(UserRole.Driver)));

        options.AddPolicy(CustomerOrStaff, policy =>
            policy.RequireAuthenticatedUser()
                  .RequireRole(
                      nameof(UserRole.Customer),
                      nameof(UserRole.Dispatcher),
                      nameof(UserRole.FleetAdmin)));

        options.AddPolicy(AuthenticatedOnly, policy =>
            policy.RequireAuthenticatedUser());
    }
}
