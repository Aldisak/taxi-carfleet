import { create } from 'zustand'
import type { OrderDetailDto } from '../../../shared/api/client'

/** State for the active ride. */
export interface ActiveOrderState {
  /** The full order detail. Null when no active ride. */
  order: OrderDetailDto | null
  /** Local ISO timestamp of when the driver arrived. Set on successful arrive transition. */
  arrivedAt: string | null
}

interface ActiveOrderStore extends ActiveOrderState {
  /** Set the active order and clear arrivedAt. */
  setOrder: (order: OrderDetailDto) => void
  /** Update the active order (e.g. after a transition). */
  updateOrder: (order: OrderDetailDto) => void
  /** Set arrivedAt (called after successful arrive transition). */
  setArrivedAt: (arrivedAt: string) => void
  /** Clear all active ride state. */
  clear: () => void
}

/**
 * Zustand store for the active ride order.
 * Mirrors the idbRideStore for in-memory access.
 * IDB persistence is managed by the transition hooks that call setOrder/setArrivedAt/clear.
 */
export const useActiveOrderStore = create<ActiveOrderStore>(set => ({
  order: null,
  arrivedAt: null,
  setOrder: (order) => set({ order, arrivedAt: null }),
  updateOrder: (order) => set({ order }),
  setArrivedAt: (arrivedAt) => set({ arrivedAt }),
  clear: () => set({ order: null, arrivedAt: null }),
}))
