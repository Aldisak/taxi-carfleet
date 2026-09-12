import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { authStorage } from '../../../shared/api/auth-storage'
import { idbAuthStore } from '../../../shared/api/idbAuthStore'
import { enableSilentRefresh, scheduleProactiveRefresh } from '../../../shared/api/refresh'
import { postStaffLogin } from '../../../shared/api/client'

/** Return type of useDriverLogin. */
export interface UseDriverLoginResult {
  fleetSlug: string
  setFleetSlug: (v: string) => void
  email: string
  setEmail: (v: string) => void
  password: string
  setPassword: (v: string) => void
  staySignedIn: boolean
  setStaySignedIn: (v: boolean) => void
  error: string | null
  isPending: boolean
  handleSubmit: (e: FormEvent) => Promise<void>
}

/**
 * Driver login hook. Reuses the staff login API endpoint.
 * - Role=Driver → /d
 * - Role=Dispatcher|FleetAdmin → /x
 * - staySignedIn=true → refresh token also persisted to IndexedDB
 * - enableSilentRefresh('/d/login') called on success (driver flow opt-in)
 */
export function useDriverLogin(): UseDriverLoginResult {
  const navigate = useNavigate()

  // Prefill fleet slug from any previously stored value
  const [fleetSlug, setFleetSlug] = useState(() => authStorage.getFleetSlug() ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [staySignedIn, setStaySignedIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setIsPending(true)

    try {
      const response = await postStaffLogin({ fleetSlug, email, password })

      // Persist tokens to localStorage
      authStorage.setTokens(
        response.accessToken,
        response.refreshToken,
        fleetSlug,
        response.user.role,
      )

      // If "stay signed in" → also store refresh token in IndexedDB for cross-session persistence
      if (staySignedIn) {
        await idbAuthStore.setRefreshToken(response.refreshToken)
      }

      // Opt the driver flow into silent refresh (proactive + 401-retry pipeline)
      enableSilentRefresh('/d/login')

      // Schedule a proactive refresh at exp−2min
      scheduleProactiveRefresh(response.accessToken)

      // Role-based landing
      const destination = response.user.role === 'Driver' ? '/d' : '/x'
      navigate(destination)
    } catch (err) {
      const status = (err as { status?: number }).status

      if (status === 401) {
        setError('driver.login.invalidCredentials')
      } else if (status != null && status >= 500) {
        setError('driver.login.networkError')
      } else {
        setError('driver.login.unknownError')
      }
    } finally {
      setIsPending(false)
    }
  }

  return {
    fleetSlug,
    setFleetSlug,
    email,
    setEmail,
    password,
    setPassword,
    staySignedIn,
    setStaySignedIn,
    error,
    isPending,
    handleSubmit,
  }
}
