using System.Net;
using FluentAssertions;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Infra;

/// <summary>Smoke test for the prometheus-net <c>/metrics</c> scrape endpoint (A2). The endpoint is
/// anonymous (network-isolated by Caddy, not authz) and returns the Prometheus text exposition format.</summary>
[Collection(TestCollections.Database)]
public sealed class MetricsEndpointTests(PostgresFixture fixture)
{
    [Fact]
    public async Task Metrics_Endpoint_Returns200AndPrometheusTextFormat()
    {
        var ct = TestContext.Current.CancellationToken;
        using var client = fixture.Factory.CreateClient();

        // Make a request first so HTTP metrics are recorded.
        await client.GetAsync("/health/live", ct);

        var response = await client.GetAsync("/metrics", ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.Should().Be("text/plain");

        var body = await response.Content.ReadAsStringAsync(ct);
        // Prometheus exposition format uses HELP/TYPE comment lines; at least one HTTP metric is present.
        body.Should().Contain("http_request");
    }
}
