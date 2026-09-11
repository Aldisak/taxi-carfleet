using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Taxi.Api.Common.Features;

namespace Taxi.Api.Features.Health;

/// <summary>Returns a simple welcome message — confirms the API is reachable.</summary>
internal sealed class WelcomeEndpoint : EndpointWithoutRequest<WelcomeResponse>
{
    private readonly HealthFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("welcome");
        AllowAnonymous();
        Description(builder => builder
            .WithName(nameof(WelcomeEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();

        Summary(s =>
        {
            s.Summary = "Welcome endpoint";
            s.Description = "Returns a greeting message. No authentication required. Useful for smoke-testing connectivity.";
            s.Responses[StatusCodes.Status200OK] = "API is running";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        await Send.OkAsync(new WelcomeResponse("Taxi API is running", "v1"), ct);
    }
}
