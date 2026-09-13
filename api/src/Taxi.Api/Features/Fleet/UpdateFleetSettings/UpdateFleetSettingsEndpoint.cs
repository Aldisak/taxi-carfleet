using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Fleet.UpdateFleetSettings;

/// <summary>Persists the fleet self-service settings onto the caller's Fleet + FleetSettings rows.
/// FleetAdmin only, tenant-scoped. No migration — all target columns already exist. Upserts a
/// FleetSettings row if the fleet has none. Returns 204 on success.</summary>
internal sealed class UpdateFleetSettingsEndpoint(TaxiDbContext dbContext, ICurrentTenant currentTenant)
    : Endpoint<UpdateFleetSettingsRequest>
{
    private readonly FleetFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Put("fleet/settings");
        Description(builder => builder
            .WithName(nameof(UpdateFleetSettingsEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Update fleet settings (FleetAdmin)";
            s.Description = "Persists name, phone, primary color, welcome text, offer timeout, SMS cap, " +
                            "and auto-dispatch toggle onto the caller's Fleet + FleetSettings. Tenant-scoped.";
            s.Responses[StatusCodes.Status204NoContent] = "Settings saved.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid field (e.g. bad color hex).";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "No fleet resolved for the request.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(UpdateFleetSettingsRequest req, CancellationToken ct)
    {
        if (currentTenant.FleetId is not Guid fleetId) { await Send.NotFoundAsync(ct); return; }

        // Fleet has no query filter — load by id (tracked for update).
        var fleet = await dbContext.Fleets.FirstOrDefaultAsync(f => f.Id == fleetId, ct);
        if (fleet is null) { await Send.NotFoundAsync(ct); return; }

        fleet.Name = req.Name;
        fleet.Phone = req.Phone;
        fleet.PrimaryColorHex = req.PrimaryColorHex;

        // FleetSettings is tenant-filtered; the tracked load finds the caller's row (or upserts one).
        var settings = await dbContext.FleetSettings.FirstOrDefaultAsync(ct);
        if (settings is null)
        {
            settings = new FleetSettings { FleetId = fleetId };
            dbContext.FleetSettings.Add(settings);
        }

        settings.WelcomeText = req.WelcomeText;
        settings.OfferTimeoutSeconds = req.OfferTimeoutSeconds;
        settings.SmsMonthlyCapCzk = req.SmsMonthlyCapCzk;
        settings.AutoDispatchEnabled = req.AutoDispatchEnabled;

        await dbContext.SaveChangesAsync(ct);
        await Send.NoContentAsync(ct);
    }
}
