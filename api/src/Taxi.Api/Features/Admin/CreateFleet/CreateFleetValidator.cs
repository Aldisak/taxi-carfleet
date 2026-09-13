using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Admin.CreateFleet;

/// <summary>Validates <see cref="CreateFleetRequest"/>: slug format, required name/phone/email.</summary>
internal sealed class CreateFleetValidator : Validator<CreateFleetRequest>
{
    /// <summary>Initializes validation rules for <see cref="CreateFleetRequest"/>.</summary>
    public CreateFleetValidator()
    {
        RuleFor(x => x.Slug)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.FleetSlugRequired)
            .Matches("^[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?$").WithErrorCode(ErrorCodes.Validation.FleetSlugInvalid);

        RuleFor(x => x.Name).NotEmpty().WithErrorCode(ErrorCodes.Validation.FleetNameRequired);
        RuleFor(x => x.Phone).NotEmpty().WithErrorCode(ErrorCodes.Validation.PhoneRequired);

        RuleFor(x => x.AdminEmail)
            .NotEmpty().WithErrorCode(ErrorCodes.Validation.AdminEmailRequired)
            .EmailAddress().WithErrorCode(ErrorCodes.Validation.EmailInvalid);
    }
}
