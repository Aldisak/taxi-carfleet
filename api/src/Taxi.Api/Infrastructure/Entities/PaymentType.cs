namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Payment method used to settle a completed <see cref="Order"/>.</summary>
public enum PaymentType
{
    /// <summary>Customer pays in cash.</summary>
    Cash,

    /// <summary>Customer pays by card.</summary>
    Card,

    /// <summary>Order is billed to the customer's account as an invoice.</summary>
    Invoice
}
