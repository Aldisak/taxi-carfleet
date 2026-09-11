using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Staff.ListStaff;

/// <summary>Lists all staff users (Driver, Dispatcher, FleetAdmin) in the current fleet (FleetAdmin only).</summary>
internal sealed class ListStaffEndpoint(TaxiDbContext dbContext)
    : EndpointWithoutRequest<ListStaffResponse>
{
    private readonly StaffFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("staff");
        Description(builder => builder
            .WithName(nameof(ListStaffEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "List staff";
            s.Description = "Returns all Driver, Dispatcher, and FleetAdmin users in the current fleet. FleetAdmin only.";
            s.Responses[StatusCodes.Status200OK] = "Staff list returned.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        // The tenant query filter scopes Users to the current fleet when FleetId is non-null.
        // Users without FleetId (Customer/SuperAdmin) are not ITenantEntity — but the global query
        // filter on User is a soft filter using HasQueryFilter that only applies to rows WITH FleetId.
        // We still apply an explicit role predicate to be safe and exclude Customer/SuperAdmin rows.
        var staffRoles = new[] { UserRole.Driver, UserRole.Dispatcher, UserRole.FleetAdmin };

        var items = await dbContext.Users.AsNoTracking()
            .Where(u => staffRoles.Contains(u.Role))
            .Select(u => new StaffSummaryDto(
                u.Id,
                u.DisplayName,
                u.Email,
                u.Role.ToString(),
                u.IsActive,
                u.LastLoginAt))
            .ToListAsync(ct);

        await Send.OkAsync(new ListStaffResponse(items, items.Count), ct);
    }
}
