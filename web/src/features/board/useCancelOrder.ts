import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postCancelOrder, ApiResponseError } from '../../shared/api/client'

/** Returns a mutation for POST /orders/{id}/cancel. On 409, invalidates the order so the card refetches. */
export function useCancelOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      postCancelOrder(orderId, reason),
    onSuccess: (_data, { orderId }) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] })
    },
    onError: (error, { orderId }) => {
      if (error instanceof ApiResponseError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['orders'] })
        void queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] })
      }
    },
  })
}
