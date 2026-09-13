using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Reports;

/// <summary>Integration tests for fleet self-service (UC-007 A6): PUT /fleet/settings, POST /fleet/logo
/// (size/format guards + LogoUpdatedAt stamp), and the additive GET /public/fleet welcomeText/logoUrl.</summary>
[Collection(TestCollections.Database)]
public sealed class FleetSettingsTests(PostgresFixture fixture)
{
    private static readonly byte[] PngMagic = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    /// <summary>PUT persists Fleet + FleetSettings fields.</summary>
    [Fact]
    public async Task FleetSettings_Put_PersistsAllFields()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId, _) = await SeedFleetAsync(ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.PutAsJsonAsync("/api/v1/fleet/settings", new
        {
            name = "Nový název",
            phone = "+420777010099",
            primaryColorHex = "#1A2B3C",
            welcomeText = "Vítejte v našem taxi",
            offerTimeoutSeconds = 60,
            smsMonthlyCapCzk = 750,
            autoDispatchEnabled = true
        }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = await db.Fleets.FirstAsync(f => f.Id == fleetId, ct);
        fleet.Name.Should().Be("Nový název");
        fleet.Phone.Should().Be("+420777010099");
        fleet.PrimaryColorHex.Should().Be("#1A2B3C");

        var settings = await db.FleetSettings.IgnoreQueryFilters().FirstAsync(s => s.FleetId == fleetId, ct);
        settings.WelcomeText.Should().Be("Vítejte v našem taxi");
        settings.OfferTimeoutSeconds.Should().Be(60);
        settings.SmsMonthlyCapCzk.Should().Be(750);
        settings.AutoDispatchEnabled.Should().BeTrue();
    }

    /// <summary>An invalid color hex → 400.</summary>
    [Fact]
    public async Task FleetSettings_Put_InvalidColor_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId, _) = await SeedFleetAsync(ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.PutAsJsonAsync("/api/v1/fleet/settings", new
        {
            name = "X",
            phone = "+420777010098",
            primaryColorHex = "red",
            offerTimeoutSeconds = 45,
            smsMonthlyCapCzk = 500,
            autoDispatchEnabled = false
        }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>A non-FleetAdmin is forbidden.</summary>
    [Fact]
    public async Task FleetSettings_NonFleetAdmin_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, _, _) = await SeedFleetAsync(ct);

        var client = fixture.Factory.CreateClient().AsDispatcher(fleetId);
        var resp = await client.PutAsJsonAsync("/api/v1/fleet/settings", new
        {
            name = "X",
            phone = "+420777010097",
            offerTimeoutSeconds = 45,
            smsMonthlyCapCzk = 500,
            autoDispatchEnabled = false
        }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>A valid PNG upload writes the file and stamps Fleet.LogoUpdatedAt.</summary>
    [Fact]
    public async Task FleetLogo_Upload_StoresFileAndStampsLogoUpdatedAt()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId, _) = await SeedFleetAsync(ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await UploadLogoAsync(client, MakePng(1024), "image/png", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = await db.Fleets.FirstAsync(f => f.Id == fleetId, ct);
        fleet.LogoUpdatedAt.Should().NotBeNull();

        var path = Path.Combine(fixture.Factory.LogoStorageRoot, "fleets", fleetId.ToString(), "logo.png");
        File.Exists(path).Should().BeTrue();
    }

    /// <summary>A &gt;200 KB upload → 400.</summary>
    [Fact]
    public async Task FleetLogo_Over200kb_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId, _) = await SeedFleetAsync(ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await UploadLogoAsync(client, MakePng(200 * 1024 + 1), "image/png", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>A non-PNG upload → 400.</summary>
    [Fact]
    public async Task FleetLogo_NonPng_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId, _) = await SeedFleetAsync(ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var notPng = new byte[512];
        notPng[0] = 0xFF; notPng[1] = 0xD8; // JPEG magic, not PNG
        var resp = await UploadLogoAsync(client, notPng, "image/png", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>AC#4 server half: GET public/fleet returns welcomeText + a cache-busted logoUrl when set.</summary>
    [Fact]
    public async Task PublicFleet_ReturnsWelcomeAndLogoUrl_WhenLogoSet()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId, slug) = await SeedFleetAsync(ct);

        var admin = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        await admin.PutAsJsonAsync("/api/v1/fleet/settings", new
        {
            name = "Branded Taxi",
            phone = "+420777010010",
            primaryColorHex = "#00AA55",
            welcomeText = "Vítejte",
            offerTimeoutSeconds = 45,
            smsMonthlyCapCzk = 500,
            autoDispatchEnabled = false
        }, ct);
        (await UploadLogoAsync(admin, MakePng(1024), "image/png", ct)).EnsureSuccessStatusCode();

        var anon = fixture.Factory.CreateClient();
        anon.DefaultRequestHeaders.Add("X-Fleet-Slug", slug);
        var branding = await anon.GetFromJsonAsync<PublicFleetDto>("/api/v1/public/fleet", ct);

        branding!.WelcomeText.Should().Be("Vítejte");
        branding.LogoUrl.Should().StartWith($"/fleets/{fleetId}/logo.png?v=");
    }

    /// <summary>A second fleet resolved by slug returns its OWN branding (no rebuild per tenant).</summary>
    [Fact]
    public async Task PublicFleet_SecondFleetBySlug_ReturnsOwnBranding()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetA, adminA, slugA) = await SeedFleetAsync(ct);
        var (fleetB, adminB, slugB) = await SeedFleetAsync(ct);

        var a = fixture.Factory.CreateClient().AsFleetAdmin(fleetA, adminA);
        await a.PutAsJsonAsync("/api/v1/fleet/settings", new
        {
            name = "Fleet A Brand",
            phone = "+420777010020",
            primaryColorHex = "#AA0000",
            welcomeText = "Ahoj A",
            offerTimeoutSeconds = 45,
            smsMonthlyCapCzk = 500,
            autoDispatchEnabled = false
        }, ct);

        var b = fixture.Factory.CreateClient().AsFleetAdmin(fleetB, adminB);
        await b.PutAsJsonAsync("/api/v1/fleet/settings", new
        {
            name = "Fleet B Brand",
            phone = "+420777010021",
            primaryColorHex = "#0000AA",
            welcomeText = "Ahoj B",
            offerTimeoutSeconds = 45,
            smsMonthlyCapCzk = 500,
            autoDispatchEnabled = false
        }, ct);

        var anonB = fixture.Factory.CreateClient();
        anonB.DefaultRequestHeaders.Add("X-Fleet-Slug", slugB);
        var brandingB = await anonB.GetFromJsonAsync<PublicFleetDto>("/api/v1/public/fleet", ct);

        brandingB!.Name.Should().Be("Fleet B Brand");
        brandingB.PrimaryColorHex.Should().Be("#0000AA");
        brandingB.WelcomeText.Should().Be("Ahoj B");
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────

    private static async Task<HttpResponseMessage> UploadLogoAsync(
        HttpClient client, byte[] bytes, string contentType, CancellationToken ct)
    {
        using var content = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        content.Add(fileContent, "file", "logo.png");
        return await client.PostAsync("/api/v1/fleet/logo", content, ct);
    }

    private static byte[] MakePng(int totalBytes)
    {
        var bytes = new byte[totalBytes];
        PngMagic.CopyTo(bytes, 0);
        return bytes;
    }

    private async Task<(Guid fleetId, Guid adminId, string slug)> SeedFleetAsync(CancellationToken ct)
    {
        var fleetId = Guid.CreateVersion7();
        var adminId = Guid.CreateVersion7();
        var slug = $"fs-{Guid.NewGuid():N}".Substring(0, 20);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = slug,
            Name = "Fleet Settings Fleet",
            Phone = "+420777010001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.Users.Add(new User
        {
            Id = adminId,
            FleetId = fleetId,
            Role = UserRole.FleetAdmin,
            Email = $"admin-{adminId:N}@fs.local",
            Phone = $"+4207775{Random.Shared.Next(100000, 999999)}",
            DisplayName = "FS Admin",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return (fleetId, adminId, slug);
    }

    private sealed record PublicFleetDto(
        string Name, string Phone, string? PrimaryColorHex, string Currency, string TimeZone,
        string? WelcomeText, string? LogoUrl);
}
