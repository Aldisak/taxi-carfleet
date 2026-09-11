using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Staff.GetStaff;

/// <summary>Gets a single staff user by ID (FleetAdmin only). Returns 404 for cross-tenant or non-staff users.</summary>
internal sealed class GetStaffEndpoint(TaxiDbContext dbContext)
    : Endpoint<GetStaffRequest, GetStaffResponse>
{
    private readonly StaffFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("staff/{id:guid}");
        Description(builder => builder
            .WithName(nameof(GetStaffEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Get staff detail";
            s.Description = "Returns detail for a staff user in the current fleet. " +
                            "Cross-tenant or non-staff (Customer/SuperAdmin) IDs return 404 — existence is not leaked.";
            s.Responses[StatusCodes.Status200OK] = "Staff user detail returned.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Staff user not found or cross-tenant.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(GetStaffRequest req, CancellationToken ct)
    {
        var staffRoles = new[] { UserRole.Driver, UserRole.Dispatcher, UserRole.FleetAdmin };

        // The tenant query filter scopes to current fleet. Explicit role filter prevents returning customers.
        var user = await dbContext.Users.AsNoTracking()
            .Where(u => u.Id == req.Id && staffRoles.Contains(u.Role))
            .FirstOrDefaultAsync(ct);

        if (user is null) { await Send.NotFoundAsync(ct); return; }

        DriverInfoDto? driverInfo = null;
        if (user.Role == UserRole.Driver)
        {
            var driver = await dbContext.Drivers.AsNoTracking()
                .Where(d => d.UserId == user.Id)
                .Select(d => new { d.Id, d.Status })
                .FirstOrDefaultAsync(ct);

            if (driver is not null)
                driverInfo = new DriverInfoDto(driver.Id, driver.Status.ToString());
        }

        await Send.OkAsync(new GetStaffResponse(
            user.Id,
            user.DisplayName,
            user.Email,
            user.Phone,
            user.Role.ToString(),
            user.IsActive,
            user.CreatedAt,
            user.LastLoginAt,
            driverInfo), ct);
    }
}
