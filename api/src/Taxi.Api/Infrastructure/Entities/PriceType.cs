namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Pricing method for an <see cref="Order"/>.</summary>
public enum PriceType
{
    /// <summary>Price is an estimate; final amount is metered or negotiated.</summary>
    Estimate,

    /// <summary>Price is fixed and agreed before the ride begins.</summary>
    Fixed,

    /// <summary>Price is determined by taximeter during the ride.</summary>
    Meter
}
