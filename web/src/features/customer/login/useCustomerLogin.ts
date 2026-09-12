import { useState, useCallback } from 'react'
import { authStorage } from '../../../shared/api/auth-storage'
import { idbAuthStore } from '../../../shared/api/idbAuthStore'
import { enableSilentRefresh, scheduleProactiveRefresh } from '../../../shared/api/refresh'
import { requestCustomerCode, verifyCustomerCode } from '../../../shared/api/client'
import { normalizeCzechPhone, isValidCode } from './phoneNormalize'

/** Which step of the two-step phone/code login is showing. */
export type CustomerLoginStep = 'phone' | 'code'

/** Options for useCustomerLogin. */
export interface UseCustomerLoginOptions {
  /**
   * Continuation invoked after tokens are stored. Standalone /c/login passes a
   * navigate('/c'); an order screen passes a resume-create callback so the inline
   * login does not lose form state (the parent owns the form — login just calls back).
   */
  onAuthenticated?: () => void
}

/** Public surface of useCustomerLogin. */
export interface UseCustomerLoginResult {
  step: CustomerLoginStep
  phone: string
  setPhone: (v: string) => void
  code: string
  setCode: (v: string) => void
  /** Epoch ms of the last successful code send (drives the 60 s resend cooldown), or null. */
  lastSentAtMs: number | null
  /** i18n key of the current error, or null. */
  error: string | null
  /** i18n key of a transient notice (e.g. "new code sent"), or null. */
  notice: string | null
  isPending: boolean
  /** Validate + normalize the phone, request a code, advance to the code step. */
  sendCode: () => Promise<void>
  /** Re-request the code for the current phone (resend). */
  resend: () => Promise<void>
  /** Verify a 6-digit code (no-op if not yet 6 digits — safe for auto-submit). */
  submitCode: (code: string) => Promise<void>
  /** Return to the phone step (change number). */
  changePhone: () => void
}

/**
 * Customer phone-code login. Embeddable: pass onAuthenticated to resume an order flow
 * inline without losing form state, or navigate standalone from /c/login. Reuses the
 * existing authStorage + IndexedDB refresh infra (no fork) and opts the customer
 * session into silent refresh so the device is never re-asked unless refresh fails.
 */
export function useCustomerLogin(options: UseCustomerLoginOptions = {}): UseCustomerLoginResult {
  const { onAuthenticated } = options

  const [step, setStep] = useState<CustomerLoginStep>('phone')
  const [phone, setPhone] = useState('')
  const [normalizedPhone, setNormalizedPhone] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [lastSentAtMs, setLastSentAtMs] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  function mapSendError(status: number | undefined): string {
    if (status === 429) return 'customer.login.tooManyRequests'
    if (status === 400) return 'customer.login.invalidPhone'
    if (status != null && status >= 500) return 'customer.login.networkError'
    return 'customer.login.unknownError'
  }

  const requestFor = useCallback(async (target: string): Promise<boolean> => {
    setError(null)
    setIsPending(true)
    try {
      await requestCustomerCode(target)
      setLastSentAtMs(Date.now())
      return true
    } catch (err) {
      setError(mapSendError((err as { status?: number }).status))
      return false
    } finally {
      setIsPending(false)
    }
  }, [])

  const sendCode = useCallback(async (): Promise<void> => {
    setNotice(null)
    const target = normalizeCzechPhone(phone)
    if (!target) {
      setError('customer.login.invalidPhone')
      return
    }
    setNormalizedPhone(target)
    const ok = await requestFor(target)
    if (ok) {
      setStep('code')
    }
  }, [phone, requestFor])

  const resend = useCallback(async (): Promise<void> => {
    setNotice(null)
    if (!normalizedPhone) return
    const ok = await requestFor(normalizedPhone)
    if (ok) {
      setCode('')
      setNotice('customer.login.resent')
    }
  }, [normalizedPhone, requestFor])

  const submitCode = useCallback(async (candidate: string): Promise<void> => {
    if (!normalizedPhone || !isValidCode(candidate)) {
      return
    }
    setError(null)
    setNotice(null)
    setIsPending(true)
    try {
      const res = await verifyCustomerCode(normalizedPhone, candidate)
      const fleetSlug = authStorage.getFleetSlug() ?? ''
      authStorage.setTokens(res.accessToken, res.refreshToken, fleetSlug, res.user.role)
      // Persist the refresh token for cross-session stay-signed-in (never re-ask on device).
      await idbAuthStore.setRefreshToken(res.refreshToken)
      // Opt the customer session into the silent-refresh pipeline.
      enableSilentRefresh('/c/login')
      scheduleProactiveRefresh(res.accessToken)
      onAuthenticated?.()
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 401) {
        setError('customer.login.codeMismatch')
      } else if (status === 429) {
        setError('customer.login.tooManyRequests')
      } else if (status != null && status >= 500) {
        setError('customer.login.networkError')
      } else {
        setError('customer.login.unknownError')
      }
    } finally {
      setIsPending(false)
    }
  }, [normalizedPhone, onAuthenticated])

  const changePhone = useCallback((): void => {
    setStep('phone')
    setCode('')
    setError(null)
    setNotice(null)
  }, [])

  return {
    step,
    phone,
    setPhone,
    code,
    setCode,
    lastSentAtMs,
    error,
    notice,
    isPending,
    sendCode,
    resend,
    submitCode,
    changePhone,
  }
}
