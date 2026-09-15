using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure;

/// <summary>EF Core database context for the Taxi API. Registers all 15 v1 entities and applies
/// snake_case naming, enum-as-string, and UUIDv7 primary key conventions.
/// Injects <see cref="ICurrentTenant"/> for global query filters and the SaveChanges guard.</summary>
internal class TaxiDbContext(DbContextOptions<TaxiDbContext> options, ICurrentTenant currentTenant)
    : DbContext(options)
{
    /// <summary>Fleet tenants.</summary>
    public DbSet<Fleet> Fleets => Set<Fleet>();

    /// <summary>All users: customers, drivers, dispatchers, fleet admins, and super-admins.</summary>
    public DbSet<User> Users => Set<User>();

    /// <summary>Driver profiles linked 1:1 to staff users with role Driver.</summary>
    public DbSet<Driver> Drivers => Set<Driver>();

    /// <summary>Fleet vehicles.</summary>
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();

    /// <summary>Driver work shifts (go-online / go-offline records).</summary>
    public DbSet<DriverShift> DriverShifts => Set<DriverShift>();

    /// <summary>Taxi ride orders.</summary>
    public DbSet<Order> Orders => Set<Order>();

    /// <summary>Immutable audit trail of order events and transitions.</summary>
    public DbSet<OrderEvent> OrderEvents => Set<OrderEvent>();

    /// <summary>Pricing route rules.</summary>
    public DbSet<Entities.Route> Routes => Set<Entities.Route>();

    /// <summary>Geographical zones used for zone-based pricing.</summary>
    public DbSet<Zone> Zones => Set<Zone>();

    /// <summary>Named places (points of interest) for quick-fill and address suggestions.</summary>
    public DbSet<Place> Places => Set<Place>();

    /// <summary>Metered pricing tariffs.</summary>
    public DbSet<Tariff> Tariffs => Set<Tariff>();

    /// <summary>Per-fleet operational settings (1:1 with Fleet).</summary>
    public DbSet<FleetSettings> FleetSettings => Set<FleetSettings>();

    /// <summary>Web Push subscriptions for real-time notifications.</summary>
    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();

    /// <summary>Refresh tokens for rotating JWT authentication.</summary>
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    /// <summary>One-time SMS verification codes for customer authentication.</summary>
    public DbSet<SmsCode> SmsCodes => Set<SmsCode>();

    /// <summary>Generic audit log for non-order entity changes.</summary>
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    /// <summary>Idempotency records for driver transition requests (claim-then-execute deduplication).</summary>
    public DbSet<IdempotencyRecord> IdempotencyRecords => Set<IdempotencyRecord>();

    /// <summary>Transactional outbox for pending notifications (drained by NotificationDispatchJob).</summary>
    public DbSet<NotificationOutbox> NotificationOutbox => Set<NotificationOutbox>();

    /// <summary>Delivery log for notifications; the unique index also serves as the send-time dedup claim.</summary>
    public DbSet<NotificationLog> NotificationLog => Set<NotificationLog>();

    /// <summary>Idempotency markers recording that the weekly digest was sent for a given ISO week per fleet.</summary>
    public DbSet<WeeklyDigestMarker> WeeklyDigestMarkers => Set<WeeklyDigestMarker>();

    /// <summary>Geo-provider API response cache keyed by (FleetId, Kind, Key). No global query filter.</summary>
    public DbSet<GeoCacheEntry> GeoCacheEntries => Set<GeoCacheEntry>();

    /// <summary>Per-fleet, per-day, per-kind aggregate of geo-provider API usage and credit consumption. No global query filter.</summary>
    public DbSet<GeoUsage> GeoUsage => Set<GeoUsage>();

    /// <summary>Idempotency markers recording that a geo budget alert was sent for a given fleet, month, and threshold.</summary>
    public DbSet<GeoBudgetAlertMarker> GeoBudgetAlertMarkers => Set<GeoBudgetAlertMarker>();

    /// <inheritdoc />
    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        base.ConfigureConventions(configurationBuilder);

        // All enum properties are stored as their string name (not integer ordinal).
        configurationBuilder.Properties<Enum>().HaveConversion<string>();
    }

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Apply all IEntityTypeConfiguration<T> implementations in this assembly.
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TaxiDbContext).Assembly);

        // UUIDv7 generator for all Guid Id properties (named "Id") on all entity types.
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            var idProperty = entityType.FindProperty("Id");
            if (idProperty is not null && idProperty.ClrType == typeof(Guid))
            {
                idProperty.SetValueGeneratorFactory((_, _) => new GuidV7ValueGenerator());
            }
        }

        // ── Global query filters for tenant isolation ─────────────────────────
        // Non-nullable FleetId entities: strict equality.
        modelBuilder.Entity<Driver>().HasQueryFilter(e => e.FleetId == currentTenant.FleetId);
        modelBuilder.Entity<Vehicle>().HasQueryFilter(e => e.FleetId == currentTenant.FleetId);
        modelBuilder.Entity<DriverShift>().HasQueryFilter(e => e.FleetId == currentTenant.FleetId);
        modelBuilder.Entity<Order>().HasQueryFilter(e => e.FleetId == currentTenant.FleetId);
        modelBuilder.Entity<OrderEvent>().HasQueryFilter(e => e.FleetId == currentTenant.FleetId);
        modelBuilder.Entity<Entities.Route>().HasQueryFilter(e => e.FleetId == currentTenant.FleetId);
        modelBuilder.Entity<Zone>().HasQueryFilter(e => e.FleetId == currentTenant.FleetId);
        modelBuilder.Entity<Place>().HasQueryFilter(e => e.FleetId == currentTenant.FleetId);
        modelBuilder.Entity<Tariff>().HasQueryFilter(e => e.FleetId == currentTenant.FleetId);
        modelBuilder.Entity<FleetSettings>().HasQueryFilter(e => e.FleetId == currentTenant.FleetId);
        modelBuilder.Entity<AuditLog>().HasQueryFilter(e => e.FleetId == currentTenant.FleetId);
        modelBuilder.Entity<NotificationOutbox>().HasQueryFilter(e => e.FleetId == currentTenant.FleetId);
        modelBuilder.Entity<NotificationLog>().HasQueryFilter(e => e.FleetId == currentTenant.FleetId);
        modelBuilder.Entity<WeeklyDigestMarker>().HasQueryFilter(e => e.FleetId == currentTenant.FleetId);
        modelBuilder.Entity<GeoBudgetAlertMarker>().HasQueryFilter(e => e.FleetId == currentTenant.FleetId);

        // Nullable FleetId entities: include rows with null FleetId (customers/superadmin are tenant-agnostic)
        // plus rows belonging to the current fleet.
        modelBuilder.Entity<User>().HasQueryFilter(
            e => e.FleetId == null || e.FleetId == currentTenant.FleetId);
        modelBuilder.Entity<PushSubscription>().HasQueryFilter(
            e => e.FleetId == null || e.FleetId == currentTenant.FleetId);

        // RefreshToken and SmsCode: NO filter — keyed by user/phone, cross-tenant by nature.
        // Fleet: NO filter — must be queryable to resolve slugs.
    }

    /// <inheritdoc />
    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        GuardTenantEntities();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    /// <inheritdoc />
    public override async Task<int> SaveChangesAsync(
        bool acceptAllChangesOnSuccess,
        CancellationToken cancellationToken = default)
    {
        GuardTenantEntities();
        return await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    /// <summary>Guards that Added and Modified tenant entities have their FleetId set correctly:
    /// <list type="bullet">
    /// <item>Non-nullable <see cref="ITenantEntity"/> (Added): if <see cref="ICurrentTenant.FleetId"/>
    ///   is non-null and the entity's FleetId is Guid.Empty (default), stamp it from the current tenant.
    ///   If the entity's FleetId is non-empty and mismatches the current tenant's non-null FleetId,
    ///   throw.</item>
    /// <item>Non-nullable <see cref="ITenantEntity"/> (Modified): throw when FleetId mismatches
    ///   the current tenant, preventing cross-tenant row migration.</item>
    /// <item>Nullable FleetId entities (<see cref="User"/>, <see cref="PushSubscription"/>): no
    ///   auto-stamp (null FleetId is a valid persisted state for customers/superadmin).
    ///   Mismatch guard applies for both Added and Modified when the entity carries a non-null FleetId
    ///   that differs from a non-null current tenant.</item>
    /// </list>
    /// A null current tenant allows any explicit FleetId write (used during seeding and by SuperAdmin).
    /// This guard protects against programmer error (sanctioned by rules/error-handling.md#exceptions-for-infrastructure).</summary>
    private void GuardTenantEntities()
    {
        if (currentTenant.FleetId is not Guid tenantFleetId) return;

        foreach (var entry in ChangeTracker.Entries())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified)) continue;

            var isAdded = entry.State == EntityState.Added;

            switch (entry.Entity)
            {
                // Non-nullable ITenantEntity: stamp (Added+empty only) or guard (all mismatches).
                case ITenantEntity tenantEntity:
                    {
                        if (isAdded && tenantEntity.FleetId == Guid.Empty)
                        {
                            // Auto-stamp from the current tenant on insert only.
                            tenantEntity.FleetId = tenantFleetId;
                        }
                        else if (tenantEntity.FleetId != tenantFleetId)
                        {
                            throw new InvalidOperationException(
                                $"Entity {entry.Entity.GetType().Name} has FleetId={tenantEntity.FleetId} " +
                                $"which does not match the current tenant FleetId={tenantFleetId}.");
                        }

                        break;
                    }

                // User: nullable FleetId — guard only when non-null and mismatches.
                case User user when user.FleetId.HasValue && user.FleetId.Value != tenantFleetId:
                    throw new InvalidOperationException(
                        $"User {user.Id} has FleetId={user.FleetId} " +
                        $"which does not match the current tenant FleetId={tenantFleetId}.");

                // PushSubscription: nullable FleetId — guard only when non-null and mismatches.
                case PushSubscription ps when ps.FleetId.HasValue && ps.FleetId.Value != tenantFleetId:
                    throw new InvalidOperationException(
                        $"PushSubscription {ps.Id} has FleetId={ps.FleetId} " +
                        $"which does not match the current tenant FleetId={tenantFleetId}.");
            }
        }
    }
}
