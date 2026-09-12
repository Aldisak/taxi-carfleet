import { create } from 'zustand'

/** The driver's own last observed geolocation. */
export interface OwnPosition {
  lat: number
  lng: number
  heading: number | null
  speed: number | null
}

interface OwnPositionStore {
  /** Last observed own position, or null before the first fix. */
  position: OwnPosition | null
  /** ISO timestamp of the last successful hub send (for Diagnostika / stale detection). */
  lastSentAt: string | null
  setPosition: (pos: OwnPosition) => void
  setLastSentAt: (at: string) => void
}

/**
 * Zustand store for the DRIVER'S OWN live position.
 *
 * Deliberately separate from usePositionStore (which caches OTHER drivers fed by the
 * server's DriverPositionChanged events, keyed by driverId). Own geolocation is a distinct
 * source; mixing them would be two writers of one datum (rules/web-architecture.md#state-tiers).
 * Written by usePositionReporting; read by RideMapStrip (own pin) and B-history Diagnostika.
 */
export const useOwnPositionStore = create<OwnPositionStore>(set => ({
  position: null,
  lastSentAt: null,
  setPosition: (position) => set({ position }),
  setLastSentAt: (lastSentAt) => set({ lastSentAt }),
}))
