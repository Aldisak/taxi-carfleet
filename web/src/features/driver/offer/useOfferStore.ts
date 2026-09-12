import { create } from 'zustand'
import type { OrderDetailDto } from '../../../shared/api/client'

/** The currently offered order, or null if no offer is showing. */
export interface OfferPayload {
  dto: OrderDetailDto
  expiresAt: string
}

interface OfferStore {
  offer: OfferPayload | null
  setOffer: (offer: OfferPayload | null) => void
  clearOffer: () => void
}

/**
 * Tiny Zustand store for the current order offer.
 * Written to by the hub handler (NewOrderOffered) and consumed by OfferTakeover.
 */
export const useOfferStore = create<OfferStore>(set => ({
  offer: null,
  setOffer: offer => set({ offer }),
  clearOffer: () => set({ offer: null }),
}))
