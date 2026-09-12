import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postCreateOrder, type CreateOrderRequest, type CreateOrderResponse } from '../../../shared/api/client'

/** The unwrapped result of a successful create: the order plus any tracking fields. */
export interface CreatedOrder {
  id: string
  publicCode: string
  trackingCode?: string
  trackingToken?: string
}

function unwrap(res: CreateOrderResponse): CreatedOrder {
  // The API returns the { order } envelope (carried UC-003 lesson); unwrap data.order.
  return {
    id: res.order.id,
    publicCode: res.order.publicCode,
    trackingCode: res.trackingCode,
    trackingToken: res.trackingToken,
  }
}

/**
 * Creates a customer order via POST /orders and unwraps the { order } envelope.
 * On success the active-order query is invalidated so Home reflects the new order.
 * Creating an order is NEVER queued offline (a stale order is worse than a failed one,
 * spec §11) — the caller gates the action on connectivity.
 */
export function useCreateOrder() {
  const queryClient = useQueryClient()

  return useMutation<CreatedOrder, Error, CreateOrderRequest>({
    mutationFn: async (req: CreateOrderRequest) => unwrap(await postCreateOrder(req)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders', 'mine', 'active'] })
    },
  })
}
