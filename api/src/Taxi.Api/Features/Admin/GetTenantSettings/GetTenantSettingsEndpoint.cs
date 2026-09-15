using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Security;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Admin.GetTenantSettings;

/// <summary>SuperAdmin-only endpoint that returns all configurable settings for a specific fleet.
/// Loads Fleet + FleetSettings by id with IgnoreQueryFilters (SuperAdmin has no tenant scope).
/// The Mapy server key value is never returned — only a configured flag.</summary>
internal sealed class GetTenantSettingsEndpoint(TaxiDbContext dbContext, IFleetKeyProtector keyProtector)
    : EndpointWithoutRequest<GetTenantSettingsResponse>
{
    private readonly AdminFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("admin/fleets/{id:guid}/settings");
        Description(builder => builder
            .WithName(nameof(GetTenantSettingsEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.SuperAdminOnly));

        Summary(s =>
        {
            s.Summary = "Get fleet settings (SuperAdmin)";
            s.Description = "Returns all editable Fleet + FleetSettings fields for the specified fleet. " +
                            "The Mapy server key value is never returned — only a mapyServerKeyConfigured flag.";
            s.Responses[StatusCodes.Status200OK] = "Fleet settings returned.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a SuperAdmin.";
            s.Responses[StatusCodes.Status404NotFound] = "Fleet not found.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");

        // SuperAdmin: must use IgnoreQueryFilters for cross-tenant reads.
        var fleet = await dbContext.Fleets
            .AsNoTracking()
            .FirstOrDefaultAsync(f => f.Id == id, ct);

        if (fleet is null) { await Send.NotFoundAsync(ct); return; }

        // FleetSettings has a tenant query filter — must use IgnoreQueryFilters + BY-ID PREDICATE.
        var settings = await dbContext.FleetSettings
            .IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.FleetId == id, ct);

        // Use entity defaults when no settings row exists.
        var s = settings ?? new FleetSettings();

        var browserKey = keyProtector.TryUnprotect(s.MapyBrowserKey);

        await Send.OkAsync(new GetTenantSettingsResponse
        {
            // Fleet fields
            Name = fleet.Name,
            Phone = fleet.Phone,
            Currency = fleet.Currency,
            TimeZone = fleet.TimeZone,
            PrimaryColorHex = fleet.PrimaryColorHex,
            IsActive = fleet.IsActive,
            // Dispatch
            OfferTimeoutSeconds = s.OfferTimeoutSeconds,
            AutoDispatchEnabled = s.AutoDispatchEnabled,
            AutoDispatchAfterSeconds = s.AutoDispatchAfterSeconds,
            MaxOfferRadiusKm = s.MaxOfferRadiusKm,
            // SMS
            SmsSenderName = s.SmsSenderName,
            WelcomeText = s.WelcomeText,
            SmsMonthlyCapCzk = s.SmsMonthlyCapCzk,
            SmsUnitCostCzk = s.SmsUnitCostCzk,
            // Map
            MapCenterLat = s.MapCenterLat,
            MapCenterLng = s.MapCenterLng,
            MapZoom = s.MapZoom,
            // Geo
            GeoMonthlyCreditBudget = s.GeoMonthlyCreditBudget,
            // Mapy keys — browser key decrypted, server key: flag only
            MapyBrowserKey = browserKey,
            MapyServerKeyConfigured = s.MapyServerKey is not null
        }, ct);
    }
}
