import { useMutation, useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { postCreateOrder } from '../../shared/api/client'
import type { CreateOrderRequest } from '../../shared/api/client'
import { normalizePhone } from './phoneNormalization'
import type { OrderFormValues } from './orderFormSchema'

// ---------------------------------------------------------------------------
// New-order highlight store
// B4 uses this to highlight newly created order cards for ~3s.
// The store holds the id + timestamp so B4 can clear expired highlights.
// ---------------------------------------------------------------------------

export interface NewOrderHighlight {
  orderId: string
  createdAt: number // Date.now()
}

interface NewOrderHighlightStore {
  highlight: NewOrderHighlight | null
  setHighlight: (highlight: NewOrderHighlight | null) => void
}

export const useNewOrderHighlightStore = create<NewOrderHighlightStore>((set) => ({
  highlight: null,
  setHighlight: (highlight) => set({ highlight }),
}))

// ---------------------------------------------------------------------------
// Create order hook
// ---------------------------------------------------------------------------

/** Converts form values to the API request payload. */
export function toCreateOrderRequest(values: OrderFormValues, estimatedPriceCzk: number | null): CreateOrderRequest {
  const phone = normalizePhone(values.phone)

  return {
    pickupAddress: values.pickup.address,
    pickupLat: values.pickup.lat!,
    pickupLng: values.pickup.lng!,
    dropoffAddress: values.dropoff.address || null,
    dropoffLat: values.dropoff.lat,
    dropoffLng: values.dropoff.lng,
    customerPhone: phone,
    customerName: values.name || null,
    scheduledAt: values.asap || !values.scheduledAt
      ? null
      : new Date(values.scheduledAt).toISOString(),
    note: values.note || null,
    passengers: values.passengers,
    priceType: estimatedPriceCzk !== null ? 'Estimate' : 'Meter',
    estimatedPriceCzk: estimatedPriceCzk ?? null,
    fixedPriceCzk: null,
    routeId: null,
  }
}

/**
 * TanStack mutation hook for POST /orders.
 * On success:
 * - Invalidates the orders query cache (B4 will refetch)
 * - Sets the new order highlight store (B4 renders the 3s highlight)
 */
export function useCreateOrder() {
  const queryClient = useQueryClient()
  const setHighlight = useNewOrderHighlightStore(s => s.setHighlight)

  const mutation = useMutation({
    mutationFn: postCreateOrder,
    onSuccess: (data) => {
      // Invalidate orders list so B4's cache refreshes
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      // Store the id + timestamp so B4 can highlight the card for ~3s
      setHighlight({ orderId: data.order.id, createdAt: Date.now() })
    },
  })

  return mutation
}
