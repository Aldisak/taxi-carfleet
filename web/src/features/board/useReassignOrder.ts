import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postReassignOrder, ApiResponseError } from '../../shared/api/client'
import type { ListOrdersResponse } from '../../shared/api/client'

/** Returns a mutation for POST /orders/{id}/reassign.
 * Optimistically updates the list cache (sets driverId to new driver),
 * rolls back on error, and invalidates on settle. On 409, also invalidates so card refetches. */
export function useReassignOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ orderId, driverId }: { orderId: string; driverId: string }) =>
      postReassignOrder(orderId, driverId),

    onMutate: async ({ orderId, driverId }) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['orders'] })

      // Snapshot all matching list caches
      const previousData = queryClient.getQueriesData<ListOrdersResponse>({ queryKey: ['orders', 'list'] })

      // Optimistically update every list cache entry
      queryClient.setQueriesData<ListOrdersResponse>({ queryKey: ['orders', 'list'] }, (old) => {
        if (!old) return old
        return {
          ...old,
          items: old.items.map((o) =>
            o.id === orderId ? { ...o, driverId } : o,
          ),
        }
      })

      return { previousData }
    },

    onError: (_error, { orderId }, context) => {
      // Restore previous data on any error
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data)
        }
      }
      if (_error instanceof ApiResponseError && _error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['orders'] })
        void queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] })
      }
    },

    onSettled: (_data, _error, { orderId }) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] })
    },
  })
}
