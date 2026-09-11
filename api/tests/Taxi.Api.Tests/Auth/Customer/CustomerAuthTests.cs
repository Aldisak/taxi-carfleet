using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Sms;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Auth.Customer;

/// <summary>Integration tests for customer SMS-code authentication.</summary>
[Collection(TestCollections.Database)]
public sealed class CustomerAuthTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    // ── Fake SMS sender ─────────────────────────────────────────────────────

    private sealed class RecordingSmsSender : ISmsSender
    {
        public List<(string Phone, string Message)> Sent { get; } = [];

        public Task SendAsync(string phone, string message, CancellationToken ct)
        {
            Sent.Add((phone, message));
            return Task.CompletedTask;
        }
    }

    // ── Factory helpers ─────────────────────────────────────────────────────

    private (WebApplicationFactory<Program> factory, RecordingSmsSender smsSender)
        CreateFactoryWithSmsSender(FakeTimeProvider? timeProvider = null)
    {
        var smsSender = new RecordingSmsSender();
        var factory = fixture.Factory.WithWebHostBuilder(b =>
        {
            b.ConfigureTestServices(services =>
            {
                services.AddSingleton<ISmsSender>(smsSender);
                if (timeProvider is not null)
                    services.AddSingleton<TimeProvider>(timeProvider);
            });
        });
        return (factory, smsSender);
    }

    private static string HashCode(string code)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(code));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static string UniquePhone() =>
        $"+4207{Random.Shared.Next(10_000_000, 99_999_999)}";

    // ── Test 1: Happy path — request code sends SMS and persists hashed code ─

    /// <summary>Verifies that a valid phone triggers an SMS and stores the hashed code in DB.</summary>
    [Fact]
    public async Task RequestCode_ValidPhone_SendsSmsAndPersistsHashedCode()
    {
        var ct = TestContext.Current.CancellationToken;
        var phone = UniquePhone();

        var (factory, smsSender) = CreateFactoryWithSmsSender();
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "api/v1/auth/customer/request-code",
            new { phone },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        smsSender.Sent.Should().HaveCount(1);
        smsSender.Sent[0].Phone.Should().Be(phone);
        var sentMessage = smsSender.Sent[0].Message;
        sentMessage.Should().NotBeNullOrEmpty();

        // Extract the raw code from the message (6 digits)
        var rawCode = new string(sentMessage.Where(char.IsDigit).ToArray());
        rawCode.Should().HaveLength(6);

        // Assert DB has the hash (not the raw code)
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var smsCode = db.SmsCodes.AsNoTracking()
            .OrderByDescending(x => x.ExpiresAt)
            .First(x => x.Phone == phone);

        smsCode.CodeHash.Should().Be(HashCode(rawCode));
        smsCode.CodeHash.Should().NotBe(rawCode); // must be hashed, not raw
    }

    // ── Test 2: Fourth request within 10 min returns 429 ────────────────────

    /// <summary>Verifies that 4 requests within 10 minutes hits the rate limit and returns 429.</summary>
    [Fact]
    public async Task RequestCode_FourthWithin10Min_Returns429()
    {
        var ct = TestContext.Current.CancellationToken;
        var phone = UniquePhone();

        // Pin time and advance 61s between sends so 60-s gate passes but all 3 prior codes stay
        // within the 10-min window.
        var fakeTime = new FakeTimeProvider(new DateTimeOffset(2026, 9, 10, 12, 0, 0, TimeSpan.Zero));
        var (factory, _) = CreateFactoryWithSmsSender(fakeTime);
        using var client = factory.CreateClient();

        // Send #1
        var r1 = await client.PostAsJsonAsync("api/v1/auth/customer/request-code", new { phone }, ct);
        r1.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Advance 61s (past the 60-s gap gate)
        fakeTime.Advance(TimeSpan.FromSeconds(61));

        // Send #2
        var r2 = await client.PostAsJsonAsync("api/v1/auth/customer/request-code", new { phone }, ct);
        r2.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Advance 61s again
        fakeTime.Advance(TimeSpan.FromSeconds(61));

        // Send #3
        var r3 = await client.PostAsJsonAsync("api/v1/auth/customer/request-code", new { phone }, ct);
        r3.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Advance 61s again — still within 10-min window from first send
        fakeTime.Advance(TimeSpan.FromSeconds(61));

        // Send #4 — should hit 3-per-10-min rate limit
        var r4 = await client.PostAsJsonAsync("api/v1/auth/customer/request-code", new { phone }, ct);
        r4.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }

    // ── Test 3: Second request within 60s returns 429 ────────────────────────

    /// <summary>Verifies that two requests within 60 seconds returns 429.</summary>
    [Fact]
    public async Task RequestCode_SecondWithin60s_Returns429()
    {
        var ct = TestContext.Current.CancellationToken;
        var phone = UniquePhone();

        var (factory, _) = CreateFactoryWithSmsSender();
        using var client = factory.CreateClient();

        // First request succeeds
        var r1 = await client.PostAsJsonAsync("api/v1/auth/customer/request-code", new { phone }, ct);
        r1.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Second request immediately — within 60s window
        var r2 = await client.PostAsJsonAsync("api/v1/auth/customer/request-code", new { phone }, ct);
        r2.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }

    // ── Test 4: Correct code creates customer and returns tokens ─────────────

    /// <summary>Verifies that a correct code creates a new customer user and returns JWT tokens.</summary>
    [Fact]
    public async Task VerifyCode_CorrectCode_CreatesCustomerAndReturnsTokens()
    {
        var ct = TestContext.Current.CancellationToken;
        var phone = UniquePhone();

        var (factory, smsSender) = CreateFactoryWithSmsSender();
        using var client = factory.CreateClient();

        // Request the code
        var reqResp = await client.PostAsJsonAsync("api/v1/auth/customer/request-code", new { phone }, ct);
        reqResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        smsSender.Sent.Should().HaveCount(1);
        var rawCode = new string(smsSender.Sent[0].Message.Where(char.IsDigit).ToArray());

        // Verify the code
        var verifyResp = await client.PostAsJsonAsync(
            "api/v1/auth/customer/verify-code",
            new { phone, code = rawCode },
            ct);

        verifyResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await verifyResp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        body.GetProperty("accessToken").GetString().Should().NotBeNullOrEmpty();
        body.GetProperty("refreshToken").GetString().Should().NotBeNullOrEmpty();

        var userObj = body.GetProperty("user");
        userObj.GetProperty("phone").GetString().Should().Be(phone);
        userObj.GetProperty("role").GetString().Should().Be("Customer");

        // Assert user was created in DB
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var user = db.Users.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefault(u => u.Phone == phone && u.Role == UserRole.Customer);
        user.Should().NotBeNull();
    }

    // ── Test 5: Wrong code returns 401 ───────────────────────────────────────

    /// <summary>Verifies that a wrong code returns 401 Unauthorized.</summary>
    [Fact]
    public async Task VerifyCode_WrongCode_Returns401()
    {
        var ct = TestContext.Current.CancellationToken;
        var phone = UniquePhone();

        var (factory, smsSender) = CreateFactoryWithSmsSender();
        using var client = factory.CreateClient();

        // Request a code first
        var reqResp = await client.PostAsJsonAsync("api/v1/auth/customer/request-code", new { phone }, ct);
        reqResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Derive wrong code by flipping the last digit — guaranteed different, still 6-digit valid shape.
        var realCode = new string(smsSender.Sent[0].Message.Where(char.IsDigit).ToArray());
        var wrongCode = realCode[..^1] + (char)('0' + (realCode[^1] - '0' + 1) % 10);

        // Submit wrong code
        var verifyResp = await client.PostAsJsonAsync(
            "api/v1/auth/customer/verify-code",
            new { phone, code = wrongCode },
            ct);

        verifyResp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── Test 6: Five wrong attempts invalidates the code ─────────────────────

    /// <summary>Verifies that 5 wrong attempts invalidate the code so even the correct code is rejected.</summary>
    [Fact]
    public async Task VerifyCode_FiveWrongAttempts_InvalidatesCode()
    {
        var ct = TestContext.Current.CancellationToken;
        var phone = UniquePhone();

        var (factory, smsSender) = CreateFactoryWithSmsSender();
        using var client = factory.CreateClient();

        // Request a code
        var reqResp = await client.PostAsJsonAsync("api/v1/auth/customer/request-code", new { phone }, ct);
        reqResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var rawCode = new string(smsSender.Sent[0].Message.Where(char.IsDigit).ToArray());

        // Derive wrong code by flipping the last digit — guaranteed different, still 6-digit valid shape.
        var wrongCode = rawCode[..^1] + (char)('0' + (rawCode[^1] - '0' + 1) % 10);

        // Submit 5 wrong codes — each should return 401
        for (var i = 0; i < 5; i++)
        {
            var wrongResp = await client.PostAsJsonAsync(
                "api/v1/auth/customer/verify-code",
                new { phone, code = wrongCode },
                ct);
            wrongResp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }

        // Now the correct code should ALSO return 401 (code is invalidated)
        var finalResp = await client.PostAsJsonAsync(
            "api/v1/auth/customer/verify-code",
            new { phone, code = rawCode },
            ct);

        finalResp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
