using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Security;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Admin.UpdateTenantSettings;

/// <summary>SuperAdmin-only endpoint that updates all configurable settings for a specific fleet.
/// Loads Fleet + FleetSettings by id with IgnoreQueryFilters (SuperAdmin has no tenant scope).
/// Upserts a FleetSettings row if missing. Stamps CurrentTenant.FleetId before SaveChanges
/// as the one sanctioned cross-tenant write (CLAUDE.md WI-04). Returns 204 on success.
/// Mapy key semantics: null=keep column, ""=clear column, non-empty=Protect+store.</summary>
internal sealed class UpdateTenantSettingsEndpoint(
    TaxiDbContext dbContext,
    CurrentTenant currentTenant,
    IFleetKeyProtector keyProtector)
    : Endpoint<UpdateTenantSettingsRequest>
{
    private readonly AdminFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Put("admin/fleets/{id:guid}/settings");
        Description(builder => builder
            .WithName(nameof(UpdateTenantSettingsEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.SuperAdminOnly));

        Summary(s =>
        {
            s.Summary = "Update fleet settings (SuperAdmin)";
            s.Description = "Persists all Fleet + FleetSettings fields for the specified fleet. " +
                            "Mapy keys: null=keep, empty=clear, non-empty=encrypt+store. " +
                            "Returns 204 on success; 404 if the fleet does not exist.";
            s.Responses[StatusCodes.Status204NoContent] = "Settings saved.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid field value.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a SuperAdmin.";
            s.Responses[StatusCodes.Status404NotFound] = "Fleet not found.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(UpdateTenantSettingsRequest req, CancellationToken ct)
    {
        var id = req.Id;

        // Fleet has no tenant filter; load tracked for update.
        var fleet = await dbContext.Fleets
            .FirstOrDefaultAsync(f => f.Id == id, ct);

        if (fleet is null) { await Send.NotFoundAsync(ct); return; }

        // Update Fleet fields
        fleet.Name = req.Name;
        fleet.Phone = req.Phone;
        fleet.Currency = req.Currency;
        fleet.TimeZone = req.TimeZone;
        fleet.PrimaryColorHex = req.PrimaryColorHex;
        fleet.IsActive = req.IsActive;

        // FleetSettings: IgnoreQueryFilters + BY-ID PREDICATE (SuperAdmin scope = null tenant).
        var settings = await dbContext.FleetSettings
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.FleetId == id, ct);

        if (settings is null)
        {
            settings = new FleetSettings { FleetId = id };
            dbContext.FleetSettings.Add(settings);
        }

        // Dispatch
        settings.OfferTimeoutSeconds = req.OfferTimeoutSeconds;
        settings.AutoDispatchEnabled = req.AutoDispatchEnabled;
        settings.AutoDispatchAfterSeconds = req.AutoDispatchAfterSeconds;
        settings.MaxOfferRadiusKm = req.MaxOfferRadiusKm;

        // SMS
        settings.SmsSenderName = req.SmsSenderName;
        settings.WelcomeText = req.WelcomeText;
        settings.SmsMonthlyCapCzk = req.SmsMonthlyCapCzk;
        settings.SmsUnitCostCzk = req.SmsUnitCostCzk;

        // Map
        settings.MapCenterLat = req.MapCenterLat;
        settings.MapCenterLng = req.MapCenterLng;
        settings.MapZoom = req.MapZoom;

        // Geo
        settings.GeoMonthlyCreditBudget = req.GeoMonthlyCreditBudget;

        // Mapy key semantics: null=keep, ""=clear, non-empty=protect+store.
        // NEVER log key values.
        if (req.MapyServerKey is not null)
            settings.MapyServerKey = req.MapyServerKey.Length == 0 ? null : keyProtector.Protect(req.MapyServerKey);

        if (req.MapyBrowserKey is not null)
            settings.MapyBrowserKey = req.MapyBrowserKey.Length == 0 ? null : keyProtector.Protect(req.MapyBrowserKey);

        // Sanctioned cross-tenant write: stamp the scope's tenant so the SaveChanges guard
        // permits writing FleetSettings for a fleet that is not the caller's own.
        currentTenant.FleetId = id;
        await dbContext.SaveChangesAsync(ct);

        await Send.NoContentAsync(ct);
    }
}
