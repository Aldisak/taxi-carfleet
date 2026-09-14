/** Which tracking data source the screen should use. */
export type TrackingMode = 'authed' | 'public' | 'none'

/** Inputs for {@link resolveTrackingMode}. */
export interface TrackingModeInput {
  /** True when a customer access token is present in storage. */
  hasToken: boolean
  /** The ?k= tracking-link token from the URL, or null/empty when absent. */
  linkToken: string | null
}

/**
 * Selects the tracking mode for /customer/t/:code (pure, unit-tested).
 *
 * - authed: the customer is logged in → live SignalR Subscribe(orderId). The token wins when
 *   both a customer token and a ?k= link token are present (the logged-in customer gets live
 *   updates even if they opened their own SMS link).
 * - public: logged out but the SMS link carries a ?k= token → poll GET public/track every 10 s
 *   (FleetHub is [Authorize], so SignalR is unavailable logged-out).
 * - none: logged out with no ?k= token → nothing to show (prompt login / call).
 */
export function resolveTrackingMode({ hasToken, linkToken }: TrackingModeInput): TrackingMode {
  if (hasToken) return 'authed'
  if (linkToken) return 'public'
  return 'none'
}
