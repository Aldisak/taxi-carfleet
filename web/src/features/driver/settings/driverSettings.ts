/**
 * Lightweight driver-specific settings store backed by localStorage.
 * B-history-settings will formalize this with a full settings screen.
 *
 * Key: 'driver_silent_mode' — separate from the dispatcher 'fleet_sound_muted' key
 * (different feature, different default semantics).
 */
const SILENT_MODE_KEY = 'driver_silent_mode'

/** Returns true when "Tichý režim" is active (default: OFF = false). */
export function getSilentMode(): boolean {
  try {
    return localStorage.getItem(SILENT_MODE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Sets the "Tichý režim" flag. */
export function setSilentMode(enabled: boolean): void {
  try {
    localStorage.setItem(SILENT_MODE_KEY, enabled ? 'true' : 'false')
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Nav app preference
// ---------------------------------------------------------------------------

const NAV_APP_KEY = 'driver_nav_app'

/** The driver's preferred navigation app. 'geo' opens the platform default via a geo: URI. */
export type NavApp = 'geo' | 'google' | 'mapy' | 'waze'

/** Returns the driver's preferred navigation app (default: 'geo'). */
export function getNavAppPreference(): NavApp {
  try {
    const value = localStorage.getItem(NAV_APP_KEY)
    if (value === 'google' || value === 'mapy' || value === 'waze') return value
  } catch {
    // ignore storage errors
  }
  return 'geo'
}

/** Sets the driver's preferred navigation app. */
export function setNavAppPreference(pref: NavApp): void {
  try {
    localStorage.setItem(NAV_APP_KEY, pref)
  } catch {
    // ignore storage errors
  }
}
