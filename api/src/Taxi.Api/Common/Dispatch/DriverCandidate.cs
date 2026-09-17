using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Dispatch;

/// <summary>Lightweight projection of a <c>Driver</c> row for use in
/// <see cref="NearestDriverSelector.SelectNearest"/>. Contains exactly the fields the
/// eligibility predicate and distance calculation require; no EF entity leaks out.
/// The containing job projects <c>Driver</c> rows into this record before calling the selector.</summary>
/// <param name="DriverId">The primary key of the driver row (<c>Driver.Id</c>).</param>
/// <param name="CurrentVehicleId">The vehicle currently assigned to the driver, or <c>null</c> if none.</param>
/// <param name="Status">Current operational status of the driver.</param>
/// <param name="LastLat">Last reported latitude in decimal degrees, or <c>null</c> if no position has been reported.</param>
/// <param name="LastLng">Last reported longitude in decimal degrees, or <c>null</c> if no position has been reported.</param>
/// <param name="LastPositionAt">UTC timestamp of the last position report, or <c>null</c> if no position has been reported.</param>
public record DriverCandidate(
    Guid DriverId,
    Guid? CurrentVehicleId,
    DriverStatus Status,
    double? LastLat,
    double? LastLng,
    DateTimeOffset? LastPositionAt);
