using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Staff.UpdateStaff;

/// <summary>Updates mutable fields of a staff user (displayName, phone, isActive). FleetAdmin only.
/// Email and Role are immutable in v1 — changing role would require driver row adjustments.
/// When isActive transitions true→false the same deactivation guards as DELETE apply:
/// (1) self-deactivation → 409; (2) online driver → 409.</summary>
internal sealed class UpdateStaffEndpoint(TaxiDbContext dbContext)
    : Endpoint<UpdateStaffRequest, UpdateStaffResponse>
{
    private readonly StaffFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Put("staff/{id:guid}");
        Description(builder => builder
            .WithName(nameof(UpdateStaffEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Update staff user";
            s.Description = "Updates displayName, phone, and isActive for a staff user. " +
                            "Email and Role are immutable in v1. Cross-tenant IDs return 404. " +
                            "When isActive transitions true→false the same guards as DELETE apply.";
            s.Responses[StatusCodes.Status200OK] = "Staff user updated.";
            s.Responses[StatusCodes.Status400BadRequest] = "Validation error.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Staff user not found or cross-tenant.";
            s.Responses[StatusCodes.Status409Conflict] = "Self-deactivation or online driver guard.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(UpdateStaffRequest req, CancellationToken ct)
    {
        var staffRoles = new[] { UserRole.Driver, UserRole.Dispatcher, UserRole.FleetAdmin };

        var user = await dbContext.Users
            .Where(u => u.Id == req.Id && staffRoles.Contains(u.Role))
            .FirstOrDefaultAsync(ct);

        if (user is null) { await Send.NotFoundAsync(ct); return; }

        // Apply deactivation guards when transitioning IsActive true→false.
        if (user.IsActive && !req.IsActive)
        {
            if (await IsSelfDeactivationAsync(req.Id, ct)) return;
            if (await IsOnlineDriverAsync(user, ct)) return;
        }

        user.DisplayName = req.DisplayName;
        user.Phone = req.Phone ?? string.Empty;
        user.IsActive = req.IsActive;

        await dbContext.SaveChangesAsync(ct);

        await Send.OkAsync(new UpdateStaffResponse(
            user.Id,
            user.DisplayName,
            user.Email,
            user.Phone,
            user.Role.ToString(),
            user.IsActive), ct);
    }

    /// <summary>Returns true (and writes 409) if the caller is trying to deactivate their own account.</summary>
    private async Task<bool> IsSelfDeactivationAsync(Guid targetId, CancellationToken ct)
    {
        var subClaim = User.FindFirst("sub")?.Value;
        if (Guid.TryParse(subClaim, out var callerId) && callerId == targetId)
        {
            AddError("You cannot deactivate your own account.", ErrorCodes.Staff.SelfDeactivation);
            await Send.ErrorsAsync(409, ct);
            return true;
        }

        return false;
    }

    /// <summary>Returns true (and writes 409) if the target user is a driver who is not offline.</summary>
    private async Task<bool> IsOnlineDriverAsync(User user, CancellationToken ct)
    {
        if (user.Role != UserRole.Driver) return false;

        var driverStatus = await dbContext.Drivers.AsNoTracking()
            .Where(d => d.UserId == user.Id)
            .Select(d => (DriverStatus?)d.Status)
            .FirstOrDefaultAsync(ct);

        if (driverStatus.HasValue && driverStatus.Value != DriverStatus.Offline)
        {
            AddError("Driver must go offline before being deactivated.", ErrorCodes.Staff.DriverIsOnline);
            await Send.ErrorsAsync(409, ct);
            return true;
        }

        return false;
    }
}
