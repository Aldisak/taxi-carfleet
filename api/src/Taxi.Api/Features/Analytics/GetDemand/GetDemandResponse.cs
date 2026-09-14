namespace Taxi.Api.Features.Analytics.GetDemand;

/// <summary>Response for GET /api/v1/analytics/demand — demand and capacity analytics for the fleet.</summary>
/// <param name="Heatmap">Order count by hour-of-day × day-of-week (Prague local), for the heat-map visualisation.</param>
/// <param name="SupplyDemand">Supply vs demand per Prague hour-of-day: orders created, online driver-seconds, and fulfillment rate.</param>
/// <param name="UnmetDemand">Unmet demand (cancelled without any driver ever accepting) per Prague hour-of-day.</param>
/// <param name="Utilization">Busy time (accept→complete) as share of online time, fleet-wide and per driver.</param>
/// <param name="ZonePickups">Pickup counts per zone (bounding-box approximation; see endpoint description).</param>
/// <param name="TopRoutes">Most frequent pickup→dropoff address pairs in the window.</param>
/// <param name="Prior">All demand sections recomputed for the prior equal-length period (null when compare=false).</param>
public record GetDemandResponse(
    List<HeatmapCellDto> Heatmap,
    List<SupplyDemandBucketDto> SupplyDemand,
    List<UnmetDemandBucketDto> UnmetDemand,
    UtilizationDto Utilization,
    List<ZonePickupDto> ZonePickups,
    List<TopRouteDto> TopRoutes,
    GetDemandPriorDto? Prior = null);

/// <summary>All demand sections recomputed for the prior equal-length period (only when compare=true).</summary>
/// <param name="Heatmap">Order count by hour-of-day × day-of-week (Prague local) for the prior period.</param>
/// <param name="SupplyDemand">Supply vs demand per Prague hour-of-day for the prior period.</param>
/// <param name="UnmetDemand">Unmet demand per Prague hour-of-day for the prior period.</param>
/// <param name="Utilization">Driver utilization for the prior period.</param>
/// <param name="ZonePickups">Pickup counts per zone (bounding-box) for the prior period.</param>
/// <param name="TopRoutes">Top pickup→dropoff routes for the prior period.</param>
public record GetDemandPriorDto(
    List<HeatmapCellDto> Heatmap,
    List<SupplyDemandBucketDto> SupplyDemand,
    List<UnmetDemandBucketDto> UnmetDemand,
    UtilizationDto Utilization,
    List<ZonePickupDto> ZonePickups,
    List<TopRouteDto> TopRoutes);

/// <summary>One cell of the hour × day-of-week demand heat-map (Prague local time).</summary>
/// <param name="Hour">Hour of day in Prague local time (0–23).</param>
/// <param name="Dow">Day of week in Prague local time (0=Sunday … 6=Saturday, per Postgres EXTRACT(DOW)).</param>
/// <param name="Count">Number of orders created in this hour/dow cell.</param>
public record HeatmapCellDto(int Hour, int Dow, int Count);

/// <summary>Supply vs demand for one Prague hour-of-day, aggregated over the window.</summary>
/// <param name="Hour">Hour of day in Prague local time (0–23).</param>
/// <param name="OrdersCreated">Total orders created in this Prague hour across all days in the window.</param>
/// <param name="OnlineSeconds">Total driver online seconds clamped to this Prague hour across all days in the window.</param>
/// <param name="FulfillmentRate">Share of completed orders among all orders created in this hour (0.0–1.0).</param>
public record SupplyDemandBucketDto(int Hour, int OrdersCreated, int OnlineSeconds, double FulfillmentRate);

/// <summary>Unmet demand for one Prague hour-of-day.</summary>
/// <param name="Hour">Hour of day in Prague local time (0–23).</param>
/// <param name="UnmetCount">Cancelled orders where no driver ever accepted the order in this Prague hour.</param>
public record UnmetDemandBucketDto(int Hour, int UnmetCount);

/// <summary>Driver utilization summary — busy time as share of online time.</summary>
/// <param name="FleetUtilization">Fleet-wide utilization (total busy seconds / total online seconds, 0.0–1.0).</param>
/// <param name="PerDriver">Per-driver breakdown.</param>
public record UtilizationDto(double FleetUtilization, List<DriverUtilizationDto> PerDriver);

/// <summary>Utilization metrics for a single driver.</summary>
/// <param name="DriverId">Driver entity ID.</param>
/// <param name="BusySeconds">Total accept→complete seconds across completed orders in the window.</param>
/// <param name="OnlineSeconds">Total closed shift duration in seconds within the window.</param>
/// <param name="Utilization">BusySeconds / OnlineSeconds (0.0–1.0; 0.0 when OnlineSeconds is zero).</param>
public record DriverUtilizationDto(Guid DriverId, int BusySeconds, int OnlineSeconds, double Utilization);

/// <summary>Pickup count for one zone (bounding-box approximation).</summary>
/// <param name="ZoneId">Zone entity ID.</param>
/// <param name="ZoneName">Zone display name.</param>
/// <param name="PickupCount">Orders whose pickup coordinates fall within the zone's bounding box.</param>
public record ZonePickupDto(Guid ZoneId, string ZoneName, int PickupCount);

/// <summary>A frequently occurring pickup→dropoff address pair.</summary>
/// <param name="PickupAddress">Pickup address string.</param>
/// <param name="DropoffAddress">Dropoff address string.</param>
/// <param name="Count">Number of orders with this exact address pair in the window.</param>
public record TopRouteDto(string PickupAddress, string DropoffAddress, int Count);
