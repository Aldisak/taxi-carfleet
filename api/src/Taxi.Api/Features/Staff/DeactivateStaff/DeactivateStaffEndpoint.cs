using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Staff.DeactivateStaff;

/// <summary>Deactivates a staff user (sets IsActive=false). FleetAdmin only. Never hard-deletes.
/// Guards: (1) cannot deactivate yourself; (2) cannot deactivate an online Driver (Status != Offline).</summary>
internal sealed class DeactivateStaffEndpoint(TaxiDbContext dbContext)
    : Endpoint<DeactivateStaffRequest>
{
    private readonly StaffFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Delete("staff/{id:guid}");
        Description(builder => builder
            .WithName(nameof(DeactivateStaffEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Deactivate staff user";
            s.Description = "Sets IsActive=false (soft delete). Never hard-deletes. " +
                            "Guard 1: self-deactivation returns 409 (you cannot lock yourself out). " +
                            "Guard 2: online Driver (Status != Offline) returns 409 (must go offline first). " +
                            "PUT /staff/{id} with isActive=false applies the same guards.";
            s.Responses[StatusCodes.Status204NoContent] = "Staff user deactivated.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Staff user not found or cross-tenant.";
            s.Responses[StatusCodes.Status409Conflict] = "Self-deactivation or online driver guard.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(DeactivateStaffRequest req, CancellationToken ct)
    {
        var staffRoles = new[] { UserRole.Driver, UserRole.Dispatcher, UserRole.FleetAdmin };

        var user = await dbContext.Users
            .Where(u => u.Id == req.Id && staffRoles.Contains(u.Role))
            .FirstOrDefaultAsync(ct);

        if (user is null) { await Send.NotFoundAsync(ct); return; }

        // Guard 1: self-deactivation
        var subClaim = User.FindFirst("sub")?.Value;
        if (Guid.TryParse(subClaim, out var callerId) && callerId == req.Id)
        {
            AddError("You cannot deactivate your own account.", ErrorCodes.Staff.SelfDeactivation);
            await Send.ErrorsAsync(409, ct);
            return;
        }

        // Guard 2: online driver
        if (user.Role == UserRole.Driver)
        {
            var driverStatus = await dbContext.Drivers.AsNoTracking()
                .Where(d => d.UserId == user.Id)
                .Select(d => (DriverStatus?)d.Status)
                .FirstOrDefaultAsync(ct);

            if (driverStatus.HasValue && driverStatus.Value != DriverStatus.Offline)
            {
                AddError("Driver must go offline before being deactivated.", ErrorCodes.Staff.DriverIsOnline);
                await Send.ErrorsAsync(409, ct);
                return;
            }
        }

        user.IsActive = false;
        await dbContext.SaveChangesAsync(ct);

        await Send.NoContentAsync(ct);
    }
}
