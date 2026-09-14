namespace Taxi.Api.Features.Analytics.GetCustomers;

/// <summary>Response for GET /api/v1/analytics/customers — customer behaviour analytics.</summary>
/// <param name="TotalRides">Total completed rides in the window (includes anonymized orders).</param>
/// <param name="TotalRevenueCzk">Total revenue CZK from completed rides in the window (includes anonymized orders).</param>
/// <param name="NewIdentities">Distinct identified customers whose first-ever completed ride is in the window. Anonymized excluded.</param>
/// <param name="ReturningIdentities">Distinct identified customers who had a prior completed ride before the window. Anonymized excluded.</param>
/// <param name="RepeatRate">ReturningIdentities / (NewIdentities + ReturningIdentities) × 100. Zero when no identities.</param>
/// <param name="FreqOne">Identified customers with exactly 1 ride in the window.</param>
/// <param name="FreqTwoToFive">Identified customers with 2–5 rides in the window.</param>
/// <param name="FreqSixPlus">Identified customers with 6 or more rides in the window.</param>
/// <param name="NewVsReturningBuckets">Per-bucket breakdown of rides by new vs returning identities (anonymized excluded).</param>
/// <param name="CohortRows">Monthly cohort retention triangle rows (acquisition month × months-since, ≤5 months back).</param>
/// <param name="TopCustomers">Top customers by rides completed (then revenue) descending. Anonymized excluded.</param>
/// <param name="Ratings">Ratings analysis: distribution, avg trend per bucket, worst-rated order list.</param>
/// <param name="Prior">All sections recomputed for the prior equal-length period (null when compare=false).</param>
public record GetCustomersResponse(
    int TotalRides,
    int TotalRevenueCzk,
    int NewIdentities,
    int ReturningIdentities,
    double RepeatRate,
    int FreqOne,
    int FreqTwoToFive,
    int FreqSixPlus,
    List<NewVsReturningBucketDto> NewVsReturningBuckets,
    List<CustomerCohortRowDto> CohortRows,
    List<TopCustomerDto> TopCustomers,
    RatingsAnalysisDto Ratings,
    GetCustomersPriorDto? Prior = null);

/// <summary>New vs returning ride counts for a time bucket.</summary>
/// <param name="Bucket">Bucket start date in yyyy-MM-dd format (Prague local).</param>
/// <param name="NewRides">Rides by identities whose first-ever ride is in the window.</param>
/// <param name="ReturningRides">Rides by identities who had a prior completed ride before the window.</param>
public record NewVsReturningBucketDto(string Bucket, int NewRides, int ReturningRides);

/// <summary>All customer sections recomputed for the prior equal-length period.</summary>
/// <param name="TotalRides">Prior-period total rides.</param>
/// <param name="TotalRevenueCzk">Prior-period total revenue CZK.</param>
/// <param name="NewIdentities">Prior-period new identities.</param>
/// <param name="ReturningIdentities">Prior-period returning identities.</param>
/// <param name="RepeatRate">Prior-period repeat rate.</param>
/// <param name="FreqOne">Prior-period frequency-one identities.</param>
/// <param name="FreqTwoToFive">Prior-period frequency 2–5 identities.</param>
/// <param name="FreqSixPlus">Prior-period frequency 6+ identities.</param>
/// <param name="NewVsReturningBuckets">Prior-period per-bucket new vs returning ride counts.</param>
/// <param name="CohortRows">Prior-period cohort triangle rows.</param>
/// <param name="TopCustomers">Prior-period top customers.</param>
/// <param name="Ratings">Prior-period ratings analysis.</param>
public record GetCustomersPriorDto(
    int TotalRides,
    int TotalRevenueCzk,
    int NewIdentities,
    int ReturningIdentities,
    double RepeatRate,
    int FreqOne,
    int FreqTwoToFive,
    int FreqSixPlus,
    List<NewVsReturningBucketDto> NewVsReturningBuckets,
    List<CustomerCohortRowDto> CohortRows,
    List<TopCustomerDto> TopCustomers,
    RatingsAnalysisDto Ratings);

/// <summary>One row in the monthly cohort retention triangle.</summary>
/// <param name="AcqMonthLabel">Acquisition month in yyyy-MM format (Prague local).</param>
/// <param name="MonthsSince">Months elapsed since acquisition (0 = same month, max 5).</param>
/// <param name="ActiveCustomers">Distinct identified customers active in this activity month.</param>
public record CustomerCohortRowDto(
    string AcqMonthLabel,
    int MonthsSince,
    int ActiveCustomers);

/// <summary>A top customer by rides and revenue.</summary>
/// <param name="CustomerUserId">Customer user account ID. Null for phone-only orders.</param>
/// <param name="CustomerPhone">Customer phone in E.164 format (most recent from order records).</param>
/// <param name="CustomerName">Customer display name (most recent from order records).</param>
/// <param name="Rides">Rides completed in the window.</param>
/// <param name="RevenueCzk">Total revenue CZK in the window.</param>
public record TopCustomerDto(
    Guid? CustomerUserId,
    string? CustomerPhone,
    string? CustomerName,
    int Rides,
    int RevenueCzk);

/// <summary>Ratings analysis for the analytics window.</summary>
/// <param name="TotalRated">Number of completed rides with a rating.</param>
/// <param name="AvgRating">Average rating (1–5). Null when no rated rides.</param>
/// <param name="Distribution">Count per star level (1–5).</param>
/// <param name="AvgTrend">Average rating per time bucket (day/week/month) over the window.</param>
/// <param name="WorstRated">Completed orders with rating ≤ 3 for complaint follow-up (up to 20, most recent first).</param>
public record RatingsAnalysisDto(
    int TotalRated,
    double? AvgRating,
    List<RatingBucketDto> Distribution,
    List<RatingTrendBucketDto> AvgTrend,
    List<WorstRatedOrderDto> WorstRated);

/// <summary>Count of completed rides with a specific star rating.</summary>
/// <param name="Stars">Star level (1–5).</param>
/// <param name="Count">Number of rated rides with this star level.</param>
public record RatingBucketDto(int Stars, int Count);

/// <summary>Average rating for a time bucket.</summary>
/// <param name="Bucket">Bucket start date in yyyy-MM-dd format (Prague local).</param>
/// <param name="Rides">Total rated rides in the bucket.</param>
/// <param name="AvgRating">Average rating (1–5) for rated rides. Null when no rated rides.</param>
public record RatingTrendBucketDto(string Bucket, int Rides, double? AvgRating);

/// <summary>A worst-rated completed order (≤3 stars) for complaint follow-up.</summary>
/// <param name="OrderId">Order entity ID.</param>
/// <param name="PublicCode">Human-readable 6-character order code.</param>
/// <param name="CompletedAt">UTC timestamp when the ride was completed.</param>
/// <param name="RatingStars">Customer rating (1–3).</param>
/// <param name="RatingComment">Optional customer comment. Null if none provided.</param>
/// <param name="DriverName">Display name of the assigned driver. Null if unassigned.</param>
public record WorstRatedOrderDto(
    Guid OrderId,
    string PublicCode,
    DateTimeOffset CompletedAt,
    int RatingStars,
    string? RatingComment,
    string? DriverName);
