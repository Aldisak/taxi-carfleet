import { useState } from 'react'
import {
  getSilentMode,
  setSilentMode as persistSilentMode,
  getNavAppPreference,
  setNavAppPreference as persistNavApp,
  type NavApp,
} from './driverSettings'

/** Return shape of useDriverSettings. */
export interface UseDriverSettingsResult {
  /** "Tichý režim" — true suppresses offer sound/vibration (default OFF). */
  silentMode: boolean
  setSilentMode: (enabled: boolean) => void
  /** Preferred navigation app for the ride nav handoff. */
  navApp: NavApp
  setNavApp: (pref: NavApp) => void
}

/**
 * React hook over the shared driverSettings localStorage module.
 *
 * Deliberately a thin write-through wrapper — it does NOT fork the storage keys.
 * Setters call the existing setSilentMode / setNavAppPreference so the same
 * 'driver_silent_mode' / 'driver_nav_app' values are read directly by
 * B-offer's useOfferSound (getSilentMode) and B-ride's navLinks (getNavAppPreference).
 * State is seeded from the getters on mount so restore works across remounts.
 */
export function useDriverSettings(): UseDriverSettingsResult {
  const [silentMode, setSilentModeState] = useState<boolean>(() => getSilentMode())
  const [navApp, setNavAppState] = useState<NavApp>(() => getNavAppPreference())

  function setSilentMode(enabled: boolean): void {
    persistSilentMode(enabled)
    setSilentModeState(enabled)
  }

  function setNavApp(pref: NavApp): void {
    persistNavApp(pref)
    setNavAppState(pref)
  }

  return { silentMode, setSilentMode, navApp, setNavApp }
}
