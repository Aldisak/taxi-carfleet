using FastEndpoints;
using FluentValidation;
using Taxi.Api.Common;

namespace Taxi.Api.Features.Orders.AddNote;

/// <summary>Validates the AddNote request — text required and max 2000 characters.</summary>
internal sealed class AddNoteValidator : Validator<AddNoteRequest>
{
    /// <summary>Initializes the validation rules.</summary>
    public AddNoteValidator()
    {
        RuleFor(x => x.Text)
            .NotEmpty()
            .WithErrorCode(ErrorCodes.Validation.NoteTextRequired);

        RuleFor(x => x.Text)
            .MaximumLength(2000)
            .WithErrorCode(ErrorCodes.Validation.NoteTextTooLong);
    }
}
