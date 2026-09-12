import { create } from 'zustand'

interface MapHighlightStore {
  /** The order id currently highlighted on the map pin. Null when no highlight is active. */
  highlightedOrderId: string | null

  /** Highlight an order pin corresponding to this card. */
  highlightOrder: (orderId: string) => void
  /** Clear the active order highlight. */
  clearHighlight: () => void
}

/**
 * Zustand store for card→pin highlight state.
 *
 * Highlight lifecycle:
 * - Clicking an order card calls highlightOrder(orderId) → MapPanel opens the popup on the
 *   corresponding pickup pin (card→pin direction).
 * - Clicking a pickup pin calls useNewOrderHighlightStore.setHighlight() → OrderCard flashes
 *   (pin→card direction — managed separately in useCreateOrder.ts).
 */
export const useMapHighlightStore = create<MapHighlightStore>((set) => ({
  highlightedOrderId: null,
  highlightOrder: (orderId) => set({ highlightedOrderId: orderId }),
  clearHighlight: () => set({ highlightedOrderId: null }),
}))
