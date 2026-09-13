using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Push.Subscribe;

/// <summary>Validates the push-subscription request: endpoint, p256dh, and auth are all required.</summary>
internal sealed class SubscribeValidator : Validator<SubscribeRequest>
{
    /// <summary>Configures the validation rules.</summary>
    public SubscribeValidator()
    {
        RuleFor(x => x.Endpoint).NotEmpty().WithErrorCode(ErrorCodes.Validation.PushEndpointRequired);
        RuleFor(x => x.P256dh).NotEmpty().WithErrorCode(ErrorCodes.Validation.PushP256dhRequired);
        RuleFor(x => x.Auth).NotEmpty().WithErrorCode(ErrorCodes.Validation.PushAuthRequired);
    }
}
