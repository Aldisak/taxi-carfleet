import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postOverrideDriverStatus, ApiResponseError } from '../../shared/api/client'
import type { ListDriversResponse } from '../../shared/api/client'

export type OverrideStatus = 'Free' | 'Busy' | 'Offline'

/**
 * Mutation for POST /drivers/{id}/status.
 * Optimistically updates the drivers list cache, rolls back on error.
 * On 409, invalidates drivers cache. On any error, propagates error for toast display.
 */
export function useOverrideStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ driverId, status }: { driverId: string; status: OverrideStatus }) =>
      postOverrideDriverStatus(driverId, { status }),

    onMutate: async ({ driverId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['drivers'] })

      const previousData = queryClient.getQueryData<ListDriversResponse>(['drivers'])

      queryClient.setQueryData<ListDriversResponse>(['drivers'], (old) => {
        if (!old) return old
        return {
          ...old,
          items: old.items.map((d) =>
            d.driverId === driverId ? { ...d, status } : d,
          ),
        }
      })

      return { previousData }
    },

    onError: (error, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['drivers'], context.previousData)
      }
      if (error instanceof ApiResponseError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['drivers'] })
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['drivers'] })
    },
  })
}
