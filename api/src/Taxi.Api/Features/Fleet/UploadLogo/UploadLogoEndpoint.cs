using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Fleet.UploadLogo;

/// <summary>Accepts a PNG logo upload (&lt;= 200 KB), stores it on disk at
/// <c>{storageRoot}/fleets/{fleetId}/logo.png</c>, and stamps <c>Fleet.LogoUpdatedAt</c>. FleetAdmin
/// only, tenant-scoped. Size/format are ENDPOINT guards (no FluentValidation on IFormFile): an oversized
/// or non-PNG upload returns 400 with a stable error code. The storage root is configurable via
/// <c>FleetLogo:StorageRoot</c> (default <c>/data</c>); Caddy serves the static file in prod (infra 08).</summary>
internal sealed class UploadLogoEndpoint(
    TaxiDbContext dbContext, ICurrentTenant currentTenant, TimeProvider timeProvider, IConfiguration configuration)
    : EndpointWithoutRequest
{
    private const long MaxBytes = 200 * 1024;

    // PNG signature: 89 50 4E 47 0D 0A 1A 0A.
    private static readonly byte[] PngMagic = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    private readonly FleetFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("fleet/logo");
        AllowFileUploads();
        Description(builder => builder
            .WithName(nameof(UploadLogoEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Upload fleet logo (FleetAdmin)";
            s.Description = "Accepts a multipart PNG (<= 200 KB), stores it on disk, and stamps " +
                            "Fleet.LogoUpdatedAt. Rejects oversized or non-PNG files with 400.";
            s.Responses[StatusCodes.Status204NoContent] = "Logo stored.";
            s.Responses[StatusCodes.Status400BadRequest] = "Missing file, too large, or not a PNG.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "No fleet resolved for the request.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        if (currentTenant.FleetId is not Guid fleetId) { await Send.NotFoundAsync(ct); return; }

        var file = Files.Count > 0 ? Files[0] : null;
        if (file is null || file.Length == 0)
        {
            AddError("No file was supplied.", ErrorCodes.FleetLogo.Missing);
            await Send.ErrorsAsync(400, ct);
            return;
        }

        if (file.Length > MaxBytes)
        {
            AddError("The logo exceeds the 200 KB limit.", ErrorCodes.FleetLogo.TooLarge);
            await Send.ErrorsAsync(400, ct);
            return;
        }

        // Read the bytes and verify the PNG magic header (do not trust content-type alone).
        await using var stream = file.OpenReadStream();
        var buffer = new byte[file.Length];
        var read = await ReadExactlyAsync(stream, buffer, ct);
        if (read < PngMagic.Length || !buffer.AsSpan(0, PngMagic.Length).SequenceEqual(PngMagic))
        {
            AddError("The logo must be a PNG image.", ErrorCodes.FleetLogo.NotPng);
            await Send.ErrorsAsync(400, ct);
            return;
        }

        var fleet = await dbContext.Fleets.FirstOrDefaultAsync(f => f.Id == fleetId, ct);
        if (fleet is null) { await Send.NotFoundAsync(ct); return; }

        var storageRoot = configuration["FleetLogo:StorageRoot"] ?? "/data";
        var dir = Path.Combine(storageRoot, "fleets", fleetId.ToString());
        Directory.CreateDirectory(dir);
        await File.WriteAllBytesAsync(Path.Combine(dir, "logo.png"), buffer, ct);

        fleet.LogoUpdatedAt = timeProvider.GetUtcNow();
        await dbContext.SaveChangesAsync(ct);

        Logger.LogInformation("Fleet logo uploaded {FleetId} {Bytes}", fleetId, file.Length);

        await Send.NoContentAsync(ct);
    }

    /// <summary>Reads up to <paramref name="buffer"/>.Length bytes, looping until the stream is drained.</summary>
    private static async Task<int> ReadExactlyAsync(Stream stream, byte[] buffer, CancellationToken ct)
    {
        var total = 0;
        while (total < buffer.Length)
        {
            var n = await stream.ReadAsync(buffer.AsMemory(total), ct);
            if (n == 0) break;
            total += n;
        }

        return total;
    }
}
