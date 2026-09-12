import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getVehicles,
  postCreateVehicle,
  putUpdateVehicle,
  deleteVehicle,
} from '../../shared/api/client'
import type { CreateVehicleRequest, UpdateVehicleRequest } from '../../shared/api/client'

export function useVehicles() {
  return useQuery({
    queryKey: ['vehicles'],
    queryFn: getVehicles,
    staleTime: 30_000,
  })
}

export function useCreateVehicle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (req: CreateVehicleRequest) => postCreateVehicle(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    },
  })
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, req }: { id: string; req: UpdateVehicleRequest }) =>
      putUpdateVehicle(id, req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    },
  })
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vehicleId: string) => deleteVehicle(vehicleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    },
  })
}
