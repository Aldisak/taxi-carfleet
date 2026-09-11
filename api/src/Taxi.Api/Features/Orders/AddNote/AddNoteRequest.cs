namespace Taxi.Api.Features.Orders.AddNote;

/// <summary>Request for POST /orders/{id}/notes. Route parameter + body text.</summary>
public sealed class AddNoteRequest
{
    /// <summary>Route-bound order ID.</summary>
    public Guid Id { get; set; }

    /// <summary>Gets or sets the note text. Required; max 2000 characters.</summary>
    public string Text { get; set; } = string.Empty;
}
