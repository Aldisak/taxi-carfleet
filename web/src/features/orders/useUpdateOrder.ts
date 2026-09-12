import { useMutation, useQueryClient } from '@tanstack/react-query'
import { patchOrder, ApiResponseError } from '../../shared/api/client'
import type { UpdateOrderRequest, OrderDetailDto } from '../../shared/api/client'

export interface UpdateOrderArgs {
  orderId: string
  /** Diff-based partial fields to patch. Only fields that changed should be included. */
  fields: Partial<Omit<UpdateOrderRequest, 'version'>>
  version: number
}

export interface UseUpdateOrderResult {
  mutate: (args: UpdateOrderArgs) => void
  isPending: boolean
  isConflict: boolean
  error: Error | null
}

/**
 * Mutation hook for PATCH /orders/{id}.
 * Sends the loaded `version` for optimistic concurrency.
 * On 409 it sets `isConflict=true` and triggers a refetch so the drawer shows fresh data.
 */
export function useUpdateOrder(
  onSuccess?: (order: OrderDetailDto) => void,
  onConflict?: () => void,
) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ orderId, fields, version }: UpdateOrderArgs) =>
      patchOrder(orderId, { ...fields, version }),
    onSuccess: (order, { orderId }) => {
      // Invalidate detail + events caches
      void queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] })
      void queryClient.invalidateQueries({ queryKey: ['orders', 'list'] })
      onSuccess?.(order)
    },
    onError: (err: Error, { orderId }) => {
      if (err instanceof ApiResponseError && err.status === 409) {
        // Conflict: refetch so the drawer shows the current server state
        void queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] })
        onConflict?.()
      }
    },
  })

  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    isConflict:
      mutation.error instanceof ApiResponseError && mutation.error.status === 409,
    error: mutation.error,
  }
}
