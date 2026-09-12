import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPlace, deletePlace, getPlaces, updatePlace } from '../../../../shared/api/client'
import type { CreatePlaceRequest, UpdatePlaceRequest } from '../../../../shared/api/client'

/** Hierarchical query key for the fleet's places. */
const PLACES_KEY = ['places'] as const

/** Loads the fleet's places (FleetAdmin), ordered by sortOrder. */
export function usePlaces() {
  return useQuery({
    queryKey: PLACES_KEY,
    queryFn: getPlaces,
    staleTime: 30_000,
  })
}

/** Creates a place and refreshes the list. */
export function useCreatePlace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (req: CreatePlaceRequest) => createPlace(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLACES_KEY })
    },
  })
}

/** Updates a place and refreshes the list. */
export function useUpdatePlace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, req }: { id: string; req: UpdatePlaceRequest }) => updatePlace(id, req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLACES_KEY })
    },
  })
}

/** Deletes a place and refreshes the list. */
export function useDeletePlace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (placeId: string) => deletePlace(placeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLACES_KEY })
    },
  })
}
