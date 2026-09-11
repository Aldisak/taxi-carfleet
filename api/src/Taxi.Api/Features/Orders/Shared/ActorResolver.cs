using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Orders;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Orders.Shared;

/// <summary>Resolves the current HTTP caller into an <see cref="Actor"/> for use with
/// <see cref="Taxi.Api.Common.Orders.OrderService"/>. Returns <see langword="null"/>
/// when the caller's identity cannot be resolved (missing sub claim, unknown role, etc.) —
/// callers should return a no-leak 404 in that case.</summary>
internal static class ActorResolver
{
    /// <summary>Builds an <see cref="Actor"/> from the JWT claims of the given principal.
    /// For Driver callers the Driver row is loaded from the database to get the driver row ID.</summary>
    /// <param name="user">The current authenticated user's <see cref="ClaimsPrincipal"/>.</param>
    /// <param name="dbContext">The database context (tenant-scoped).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>The resolved <see cref="Actor"/>, or <see langword="null"/> if resolution fails.</returns>
    public static async Task<Actor?> ResolveAsync(
        ClaimsPrincipal user,
        TaxiDbContext dbContext,
        CancellationToken ct)
    {
        var subClaim = user.FindFirst("sub")?.Value;
        var roleClaim = user.FindFirst("role")?.Value;

        if (string.IsNullOrEmpty(subClaim) || !Guid.TryParse(subClaim, out var userId))
            return null;

        if (!Enum.TryParse<UserRole>(roleClaim, out var role))
            return null;

        if (role == UserRole.Driver)
        {
            var driverId = await dbContext.Drivers.AsNoTracking()
                .Where(d => d.UserId == userId)
                .Select(d => (Guid?)d.Id)
                .FirstOrDefaultAsync(ct);

            if (driverId is null)
                return null;

            return new Actor(userId, role, driverId.Value);
        }

        return new Actor(userId, role);
    }
}
