import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ApiResponseError, adminLogin } from '../../shared/api/client'
import { authStorage } from '../../shared/api/auth-storage'

export interface AdminLoginParams {
  email: string
  password: string
}

export interface UseAdminLoginResult {
  login: (params: AdminLoginParams) => void
  isPending: boolean
  /** i18n key for the error message to display, or null when no error. Caller translates via t(). */
  errorMessageKey: string | null
}

/**
 * SuperAdmin login mutation for the /admin/login route. On success persists tokens with an EMPTY
 * fleet slug (a SuperAdmin is fleetless — an empty slug keeps getFleetSlug() falsy so no stale
 * X-Fleet-Slug leaks onto the cross-tenant /admin/* calls) and navigates to /admin, which
 * re-mounts AdminGuard so it re-reads the freshly-stored SuperAdmin role.
 */
export function useAdminLogin(): UseAdminLoginResult {
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: adminLogin,
    onSuccess(data) {
      authStorage.setTokens(data.accessToken, data.refreshToken, '', data.user.role)
      navigate('/admin')
    },
  })

  let errorMessageKey: string | null = null
  if (mutation.error) {
    if (mutation.error instanceof ApiResponseError && mutation.error.status === 401) {
      errorMessageKey = 'admin.login.invalidCredentials'
    } else if (
      mutation.error instanceof TypeError ||
      (mutation.error instanceof Error && mutation.error.message.toLowerCase().includes('network'))
    ) {
      errorMessageKey = 'admin.login.networkError'
    } else {
      errorMessageKey = 'admin.login.unknownError'
    }
  }

  return {
    login: (params: AdminLoginParams) => mutation.mutate(params),
    isPending: mutation.isPending,
    errorMessageKey,
  }
}
