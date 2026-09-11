using System.Net;
using FluentAssertions;

namespace Taxi.Api.Tests.Infrastructure;

/// <summary>Integration tests for the health check endpoints, verifying the API starts correctly
/// against a real Postgres database.</summary>
[Collection(TestCollections.Database)]
public sealed class HealthCheckTests(PostgresFixture fixture)
{
    /// <summary>Verifies that <c>/health/ready</c> returns HTTP 200 when the Postgres container is
    /// running and the Npgsql health check passes.</summary>
    [Fact]
    public async Task HealthCheck_ReadyEndpoint_Returns200()
    {
        using var client = fixture.Factory.CreateClient();

        var response = await client.GetAsync("/health/ready", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
