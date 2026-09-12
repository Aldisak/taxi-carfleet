import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getStaff,
  postCreateStaff,
  putUpdateStaff,
  deleteStaff,
} from '../../shared/api/client'
import type { CreateStaffRequest, UpdateStaffRequest } from '../../shared/api/client'

export function useStaff() {
  return useQuery({
    queryKey: ['staff'],
    queryFn: getStaff,
    staleTime: 30_000,
  })
}

export function useCreateStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (req: CreateStaffRequest) => postCreateStaff(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}

export function useUpdateStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, req }: { id: string; req: UpdateStaffRequest }) =>
      putUpdateStaff(id, req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}

export function useDeactivateStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (staffId: string) => deleteStaff(staffId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}
