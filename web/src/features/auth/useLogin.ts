import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ApiResponseError, postStaffLogin } from '../../shared/api/client'
import { authStorage } from '../../shared/api/auth-storage'

export interface LoginParams {
  fleetSlug: string
  email: string
  password: string
}

export interface UseLoginResult {
  login: (params: LoginParams) => void
  isPending: boolean
  /** i18n key for the error message to display, or null when no error. Caller translates via t(). */
  errorMessageKey: string | null
}

export function useLogin(): UseLoginResult {
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: postStaffLogin,
    onSuccess(data, variables) {
      authStorage.setTokens(data.accessToken, data.refreshToken, variables.fleetSlug, data.user.role)
      navigate('/x')
    },
  })

  let errorMessageKey: string | null = null
  if (mutation.error) {
    if (mutation.error instanceof ApiResponseError && mutation.error.status === 401) {
      errorMessageKey = 'login.invalidCredentials'
    } else if (
      mutation.error instanceof TypeError ||
      (mutation.error instanceof Error && mutation.error.message.toLowerCase().includes('network'))
    ) {
      errorMessageKey = 'login.networkError'
    } else {
      errorMessageKey = 'login.unknownError'
    }
  }

  return {
    login: (params: LoginParams) => mutation.mutate(params),
    isPending: mutation.isPending,
    errorMessageKey,
  }
}
