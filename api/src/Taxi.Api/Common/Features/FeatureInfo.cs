namespace Taxi.Api.Common.Features;

/// <summary>Swagger tag information for a feature slice.</summary>
/// <param name="Name">The Swagger tag name (short + descriptive).</param>
/// <param name="Description">Human-readable description of the feature.</param>
public record FeatureInfo(string Name, string Description);
