namespace Taxi.Api.Common.Ops;

/// <summary>Operations options bound from the <c>Ops</c> configuration section. Drives the 5xx-alert
/// recipient lookup (A3) and the disk-alert SMS recipient documented in the runbook.</summary>
public sealed class OpsOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Ops";

    /// <summary>Slug of the fleet whose active FleetAdmins receive infra alerts. Default <c>"ops"</c>.
    /// ASSUMPTION (labeled): there is no dedicated `ops` fleet concept in code — the alerter looks up a
    /// fleet by this slug; if it (or its FleetAdmin subscriptions) are absent, the alert is a no-op.</summary>
    public string FleetSlug { get; set; } = "ops";

    /// <summary>Maximum 5xx responses tolerated within a one-minute window before an alert fires.
    /// The alert fires when the count exceeds this value (i.e. the 11th 5xx in a minute).</summary>
    public int MaxServerErrorsPerMinute { get; set; } = 10;
}
