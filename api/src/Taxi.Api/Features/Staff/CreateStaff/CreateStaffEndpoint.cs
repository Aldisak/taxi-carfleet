using System.Security.Cryptography;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Staff.CreateStaff;

/// <summary>Creates a new staff user (Driver, Dispatcher, or FleetAdmin) in the current fleet.
/// Returns a one-time temporary password in the 201 response — it is never logged.</summary>
internal sealed class CreateStaffEndpoint(TaxiDbContext dbContext, ICurrentTenant currentTenant, TimeProvider timeProvider)
    : Endpoint<CreateStaffRequest, CreateStaffResponse>
{
    private readonly StaffFeatureConfiguration _featureConfiguration = new();

    // Unambiguous charset: no 0/O/1/I/l to avoid confusion when reading.
    private const string TempPasswordCharset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    private const int TempPasswordLength = 16;

    /// <inheritdoc />
    public override void Configure()
    {
        Post("staff");
        Description(builder => builder
            .WithName(nameof(CreateStaffEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Create staff user";
            s.Description = "Creates a new staff user (Driver/Dispatcher/FleetAdmin) with a generated temporary password. " +
                            "The plaintext temporary password is returned EXACTLY ONCE in the 201 response and is never logged. " +
                            "When role=Driver, a linked Driver row (Status=Offline) is created in the same transaction. " +
                            "Duplicate email within the fleet returns 409.";
            s.Responses[StatusCodes.Status201Created] = "Staff user created. Response includes the one-time temporary password.";
            s.Responses[StatusCodes.Status400BadRequest] = "Validation error.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status409Conflict] = "A staff member with this email already exists in the fleet.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CreateStaffRequest req, CancellationToken ct)
    {
        var fleetId = currentTenant.FleetId;
        if (fleetId is null)
        {
            AddError("No fleet resolved.", ErrorCodes.Validation.NoTenantResolved);
            await Send.ErrorsAsync(400, ct);
            return;
        }

        // App-level duplicate email check (backed by partial unique index on (fleet_id, email) WHERE email IS NOT NULL).
        var emailExists = await dbContext.Users.AsNoTracking()
            .AnyAsync(u => u.FleetId == fleetId && u.Email == req.Email, ct);
        if (emailExists)
        {
            AddError("A staff member with this email already exists in this fleet.", ErrorCodes.Staff.DuplicateEmail);
            await Send.ErrorsAsync(409, ct);
            return;
        }

        // Parse role — validator already verified it's in the allowlist.
        var role = Enum.Parse<UserRole>(req.Role);

        // Generate temp password — plaintext is only held in this scope; NOT logged.
        var tempPassword = GenerateTempPassword();
        var passwordHash = BCrypt.Net.BCrypt.HashPassword(tempPassword, workFactor: 11);

        var now = timeProvider.GetUtcNow();

        var user = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId.Value,
            Role = role,
            Email = req.Email,
            PasswordHash = passwordHash,
            Phone = req.Phone ?? string.Empty,
            DisplayName = req.DisplayName,
            IsActive = true,
            CreatedAt = now
        };

        dbContext.Users.Add(user);

        // When role=Driver, also create the linked Driver row in the same SaveChanges.
        if (role == UserRole.Driver)
        {
            var driverRow = new Driver
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleetId.Value,
                UserId = user.Id,
                Status = DriverStatus.Offline,
                IsActive = true
            };
            dbContext.Drivers.Add(driverRow);
        }

        try
        {
            await dbContext.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            // Race condition backstop: the partial unique index on (fleet_id, email) fires.
            AddError("A staff member with this email already exists in this fleet.", ErrorCodes.Staff.DuplicateEmail);
            await Send.ErrorsAsync(409, ct);
            return;
        }

        await Send.CreatedAtAsync<GetStaff.GetStaffEndpoint>(
            new { id = user.Id },
            new CreateStaffResponse(user.Id, tempPassword),
            cancellation: ct);
    }

    private static string GenerateTempPassword()
        => RandomNumberGenerator.GetString(TempPasswordCharset, TempPasswordLength);

    private static bool IsUniqueViolation(DbUpdateException ex)
        => ex.InnerException is Npgsql.PostgresException pe && pe.SqlState == "23505";
}
