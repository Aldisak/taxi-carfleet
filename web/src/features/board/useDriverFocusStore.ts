import { create } from 'zustand'

/**
 * Zustand store for driver focus state.
 * When a dispatcher clicks a driver row, the focused driver id is set here.
 * B7 (map) consumes this to center on the driver.
 */

interface DriverFocusStore {
  focusedDriverId: string | null
  setFocusedDriverId: (id: string | null) => void
}

export const useDriverFocusStore = create<DriverFocusStore>((set) => ({
  focusedDriverId: null,
  setFocusedDriverId: (id) => set({ focusedDriverId: id }),
}))
