using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Staff.CreateStaff;

/// <summary>Validates the create staff request — checks required fields and role allowlist.</summary>
internal sealed class CreateStaffValidator : Validator<CreateStaffRequest>
{
    /// <summary>Allowed staff roles for creation: Driver, Dispatcher, FleetAdmin only.</summary>
    private static readonly HashSet<string> AllowedRoles =
    [
        nameof(UserRole.Driver),
        nameof(UserRole.Dispatcher),
        nameof(UserRole.FleetAdmin)
    ];

    /// <summary>Initializes the validation rules.</summary>
    public CreateStaffValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.EmailRequired)
            .EmailAddress()
            .WithErrorCode(ErrorCodes.Validation.EmailInvalid);

        RuleFor(x => x.DisplayName)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.DisplayNameRequired);

        RuleFor(x => x.Role)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.RoleRequired)
            .Must(r => AllowedRoles.Contains(r))
            .WithErrorCode(ErrorCodes.Validation.RoleNotAllowed);
    }
}
