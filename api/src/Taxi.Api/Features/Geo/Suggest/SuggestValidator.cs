using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Geo.Suggest;

/// <summary>Validates the GET /geo/suggest request.</summary>
internal sealed class SuggestValidator : Validator<SuggestRequest>
{
    /// <summary>Initializes validation rules.</summary>
    public SuggestValidator()
    {
        RuleFor(x => x.Q)
            .MinimumLength(3)
            .WithErrorCode(ErrorCodes.Geo.SuggestQueryTooShort);
    }
}
