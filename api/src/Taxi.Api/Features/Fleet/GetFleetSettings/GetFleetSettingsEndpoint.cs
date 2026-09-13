using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Fleet.GetFleetSettings;

/// <summary>Returns the combined Fleet and FleetSettings DTO for the current fleet admin (read-only).
/// Powers the Settings Fleet tab. No write endpoint — auto-dispatch/offer-timeout editing is v1.1.</summary>
internal sealed class GetFleetSettingsEndpoint(TaxiDbContext dbContext, ICurrentTenant currentTenant)
    : EndpointWithoutRequest<GetFleetSettingsResponse>
{
    private readonly FleetFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("fleet/settings");
        Description(builder => builder
            .WithName(nameof(GetFleetSettingsEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Get fleet settings";
            s.Description = "Returns the combined Fleet and FleetSettings DTO for the current fleet. FleetAdmin only. " +
                            "No write endpoint — auto-dispatch/offer-timeout editing is v1.1.";
            s.Responses[StatusCodes.Status200OK] = "Fleet settings DTO.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "No fleet resolved for the current request.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        var fleetId = currentTenant.FleetId;
        if (fleetId is null) { await Send.NotFoundAsync(ct); return; }

        // Load Fleet (no query filter on Fleet table) + FleetSettings (filtered by tenant).
        var fleet = await dbContext.Fleets.AsNoTracking()
            .FirstOrDefaultAsync(f => f.Id == fleetId, ct);
        if (fleet is null) { await Send.NotFoundAsync(ct); return; }

        var settings = await dbContext.FleetSettings.AsNoTracking()
            .FirstOrDefaultAsync(ct);

        // Use entity defaults if no FleetSettings row exists so the read round-trips honestly.
        var offerTimeout = settings?.OfferTimeoutSeconds ?? 45;
        var autoDispatch = settings?.AutoDispatchEnabled ?? false;
        var welcomeText = settings?.WelcomeText;
        var smsMonthlyCap = settings?.SmsMonthlyCapCzk ?? 500;

        await Send.OkAsync(new GetFleetSettingsResponse(
            fleet.Name,
            fleet.Phone,
            offerTimeout,
            autoDispatch,
            fleet.PrimaryColorHex,
            welcomeText,
            smsMonthlyCap), ct);
    }
}
