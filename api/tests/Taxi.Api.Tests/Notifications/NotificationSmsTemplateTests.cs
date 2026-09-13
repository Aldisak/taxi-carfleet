using FluentAssertions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Taxi.Api.Common.Notifications;
using Taxi.Api.Common.Tracking;

namespace Taxi.Api.Tests.Notifications;

/// <summary>Build-time SMS template tests (A3, AC#5). Named <c>NotificationSmsTemplateTests</c> so the
/// FQN contains "Notifications.Notification" and runs under the A3 single-token filter. Renders every
/// SMS template with the LONGEST realistic values — crucially a REAL minted tracking token (not a fake
/// short one), a 30-char fleet name, and a realistic prod base URL — and asserts each fits one GSM-7
/// 160-char message. A fake short token here would silently let the real SMS exceed 160 (it did).</summary>
public sealed class NotificationSmsTemplateTests
{
    // Longest realistic values.
    private const string LongFleet = "Prazska Mestska Taxisluzba 123"; // 30 chars, no diacritics
    private const string Code = "K7F2A9";                              // 6 chars
    private const string ProdBaseUrl = "https://t.taxi-fleet.cz";      // realistic prod origin
    private const string LongDriver = "Frantisek Nejdelsi Jmeno";       // long ASCII driver name
    private const string Plate = "1AB 2345";
    private const string LongColor = "Tmave Modra Metaliza";

    /// <summary>Mints a REAL tracking token so the rendered SMS reflects production length.</summary>
    private static string RealToken()
    {
        var options = Options.Create(new TrackingOptions { HmacKey = "dev-tracking-hmac-key-min-32-chars-000000" });
        var svc = new TrackingTokenService(options, new FakeTimeProvider(new DateTimeOffset(2026, 9, 10, 12, 0, 0, TimeSpan.Zero)));
        return svc.Mint(Guid.NewGuid(), new DateTimeOffset(2026, 9, 11, 12, 0, 0, TimeSpan.Zero));
    }

    [Fact]
    public void SmsTemplates_AllTemplates_Fit160Gsm7WithLongestValues()
    {
        var realLink = TrackingLink.Build(ProdBaseUrl, Code, RealToken());
        var orderCreated = SmsTemplates.OrderCreated(LongFleet, Code, realLink);
        var driverArrived = SmsTemplates.DriverArrived(LongFleet, LongDriver, Plate, LongColor);

        GsmSevenValidator.IsGsm7AndWithinLimit(orderCreated).Should().BeTrue(
            $"OrderCreated must fit 160 GSM-7 chars with a REAL token; was {orderCreated.Length}: {orderCreated}");
        GsmSevenValidator.IsGsm7AndWithinLimit(driverArrived).Should().BeTrue(
            $"DriverArrived must fit 160 GSM-7 chars; was {driverArrived.Length}: {driverArrived}");
    }

    [Fact]
    public void SmsTemplates_DiacriticInput_FailsGsm7()
    {
        // A Czech diacritic message must be rejected by the GSM-7 validator.
        var withDiacritics = SmsTemplates.OrderCreated("Příliš žluťoučký", Code, "https://t.cz/x");

        GsmSevenValidator.IsGsm7AndWithinLimit(withDiacritics).Should().BeFalse(
            "diacritics are not GSM-7 encodable");
    }

    [Fact]
    public void GsmSevenValidator_Over160_FailsEvenWhenAscii()
    {
        var tooLong = new string('a', 161);
        GsmSevenValidator.IsGsm7AndWithinLimit(tooLong).Should().BeFalse();
    }

    [Fact]
    public void GsmSevenValidator_Exactly160Ascii_Passes()
    {
        var exact = new string('a', 160);
        GsmSevenValidator.IsGsm7AndWithinLimit(exact).Should().BeTrue();
    }
}
