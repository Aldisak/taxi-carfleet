import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { postResetPassword } from '../../shared/api/client'
import { createOneTimePasswordState } from './resetPassword'
import type { OneTimePasswordState } from './resetPassword'

/**
 * Hook for resetting a staff member's password.
 * Manages the one-time password display state machine.
 */
export function useResetPassword() {
  const [passwordState, setPasswordState] = useState<OneTimePasswordState>(
    createOneTimePasswordState(),
  )

  const mutation = useMutation({
    mutationFn: (staffId: string) => postResetPassword(staffId),
    onSuccess: (data) => {
      setPasswordState((s) => s.reveal(data.temporaryPassword))
    },
  })

  function dismissPassword() {
    setPasswordState((s) => s.dismiss())
  }

  return {
    resetPassword: mutation.mutate,
    isPending: mutation.isPending,
    error: mutation.error,
    passwordState,
    dismissPassword,
  }
}
