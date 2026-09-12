/**
 * Pure function: maps order status + no-show state to ride screen button configuration.
 * No side effects. No timers.
 */
export interface RideButtonState {
  /** The primary CTA action key. */
  primaryAction: 'arrive' | 'start' | 'complete' | null
  /** i18n key for primary button. */
  primaryLabel: string | null
  /** Optional nav link action. */
  navAction: 'navigate' | null
  /** i18n key for nav button. */
  navLabel: string | null
  /** Secondary action (no-show). */
  secondaryAction: 'noShow' | null
  /** i18n key for secondary button. */
  secondaryLabel: string | null
  /** Whether no-show button is enabled (5 min elapsed). */
  noShowEnabled: boolean
  /** Remaining seconds until no-show is enabled. Null when already enabled or irrelevant. */
  noShowCountdownSeconds: number | null
}

/**
 * Derives the set of action buttons to show on the active ride screen.
 *
 * @param status    Current order status string
 * @param noShowEnabled  True when ≥5 min has elapsed since arrivedAt
 * @param noShowCountdownSeconds  Seconds remaining until no-show enabled; null when already enabled
 * @param hasDropoff  True when a dropoff location is present (defaults to true)
 */
export function deriveRideButtons(
  status: string,
  noShowEnabled: boolean,
  noShowCountdownSeconds: number | null,
  hasDropoff = true,
): RideButtonState {
  switch (status) {
    case 'Accepted':
      return {
        primaryAction: 'arrive',
        primaryLabel: 'driver.ride.arrive',
        navAction: 'navigate',
        navLabel: 'driver.ride.navigate',
        secondaryAction: null,
        secondaryLabel: null,
        noShowEnabled: false,
        noShowCountdownSeconds: null,
      }

    case 'Arrived':
      return {
        primaryAction: 'start',
        primaryLabel: 'driver.ride.start',
        navAction: null,
        navLabel: null,
        secondaryAction: 'noShow',
        secondaryLabel: 'driver.ride.noShow',
        noShowEnabled,
        noShowCountdownSeconds,
      }

    case 'InProgress':
      return {
        primaryAction: 'complete',
        primaryLabel: 'driver.ride.complete',
        navAction: hasDropoff ? 'navigate' : null,
        navLabel: hasDropoff ? 'driver.ride.navigateToDropoff' : null,
        secondaryAction: null,
        secondaryLabel: null,
        noShowEnabled: false,
        noShowCountdownSeconds: null,
      }

    default:
      return {
        primaryAction: null,
        primaryLabel: null,
        navAction: null,
        navLabel: null,
        secondaryAction: null,
        secondaryLabel: null,
        noShowEnabled: false,
        noShowCountdownSeconds: null,
      }
  }
}
