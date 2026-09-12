import { create } from 'zustand'

/** Driver position data from DriverPositionChanged events. */
export interface DriverPosition {
  driverId: string
  lat: number
  lng: number
  heading: number | null
  speed: number | null
  at: string
}

interface PositionStore {
  positions: Map<string, DriverPosition>
  updatePosition: (pos: DriverPosition) => void
  getPosition: (driverId: string) => DriverPosition | undefined
}

/**
 * Zustand store for live driver positions.
 * Updated by DriverPositionChanged events (B6).
 * Consumed by B7 map markers.
 */
export const usePositionStore = create<PositionStore>((set, get) => ({
  positions: new Map(),
  updatePosition: (pos) =>
    set((state) => {
      const next = new Map(state.positions)
      next.set(pos.driverId, pos)
      return { positions: next }
    }),
  getPosition: (driverId) => get().positions.get(driverId),
}))
