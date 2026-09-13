using System.Security.Cryptography;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Admin;

/// <summary>Shared fleet-provisioning logic used by the SuperAdmin create-fleet endpoint. Builds the
/// full starter set for a new tenant — Fleet, FleetSettings defaults, a default Tariff, and a FleetAdmin
/// user with a generated one-time password — as tracked entities on a caller-supplied DbContext. The
/// caller is responsible for setting the scope's tenant context to the new fleet id and calling
/// SaveChanges (this is the one sanctioned cross-tenant write — CLAUDE.md WI-04).</summary>
internal static class FleetProvisioning
{
    // Unambiguous charset (no 0/O/1/I/l), matching CreateStaffEndpoint.
    private const string TempPasswordCharset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    private const int TempPasswordLength = 16;

    /// <summary>Builds and attaches the new fleet's entities to <paramref name="addFleet"/>,
    /// <paramref name="addSettings"/>, <paramref name="addTariff"/>, and <paramref name="addUser"/>
    /// delegates (typically <c>db.Fleets.Add</c> etc.). Returns the new fleet id and the FleetAdmin's
    /// one-time plaintext password (never logged).</summary>
    /// <param name="slug">The unique fleet slug.</param>
    /// <param name="name">The fleet display name.</param>
    /// <param name="phone">The fleet contact phone (E.164).</param>
    /// <param name="adminEmail">The FleetAdmin's login email.</param>
    /// <param name="now">The creation timestamp (from TimeProvider).</param>
    /// <param name="addFleet">Adds the Fleet entity.</param>
    /// <param name="addSettings">Adds the FleetSettings entity.</param>
    /// <param name="addTariff">Adds the default Tariff entity.</param>
    /// <param name="addUser">Adds the FleetAdmin User entity.</param>
    /// <returns>The new fleet id and the one-time admin password.</returns>
    public static (Guid fleetId, string oneTimePassword) Build(
        string slug,
        string name,
        string phone,
        string adminEmail,
        DateTimeOffset now,
        Action<Fleet> addFleet,
        Action<FleetSettings> addSettings,
        Action<Tariff> addTariff,
        Action<User> addUser)
    {
        var fleetId = Guid.CreateVersion7();

        addFleet(new Fleet
        {
            Id = fleetId,
            Slug = slug,
            Name = name,
            Phone = phone,
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = now
        });

        addSettings(new FleetSettings
        {
            FleetId = fleetId,
            OfferTimeoutSeconds = 45,
            AutoDispatchEnabled = false,
            AutoDispatchAfterSeconds = 60,
            MaxOfferRadiusKm = 15,
            SmsMonthlyCapCzk = 500,
            SmsUnitCostCzk = 1
        });

        addTariff(new Tariff
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            Name = "Základní tarif",
            BaseFareCzk = 40,
            PerKmCzk = 28,
            PerMinuteWaitingCzk = 5,
            MinimumFareCzk = 100,
            IsDefault = true,
            IsEnabled = true
        });

        var oneTimePassword = GeneratePassword();
        addUser(new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            Role = UserRole.FleetAdmin,
            Email = adminEmail,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(oneTimePassword, workFactor: 11),
            Phone = phone,
            DisplayName = name + " Admin",
            IsActive = true,
            CreatedAt = now
        });

        return (fleetId, oneTimePassword);
    }

    /// <summary>Generates a 16-character unambiguous one-time password.</summary>
    public static string GeneratePassword()
        => RandomNumberGenerator.GetString(TempPasswordCharset, TempPasswordLength);
}
