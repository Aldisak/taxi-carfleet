using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Push.Unsubscribe;

/// <summary>Validates the unsubscribe request: endpoint is required.</summary>
internal sealed class UnsubscribeValidator : Validator<UnsubscribeRequest>
{
    /// <summary>Configures the validation rules.</summary>
    public UnsubscribeValidator()
    {
        RuleFor(x => x.Endpoint).NotEmpty().WithErrorCode(ErrorCodes.Validation.PushEndpointRequired);
    }
}
