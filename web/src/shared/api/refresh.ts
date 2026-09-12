import { authStorage } from './auth-storage'
import { idbAuthStore } from './idbAuthStore'

const BASE_URL = (import.meta as ImportMeta & { env: { VITE_API_BASE_URL?: string } }).env
  ?.VITE_API_BASE_URL ?? '/api/v1'

/**
 * Module-level single-flight mutex.
 * Ensures only ONE /auth/refresh request is in-flight at a time.
 * Concurrent callers await the same promise, so only one token rotation occurs.
 */
let refreshInFlight: Promise<boolean> | null = null

/**
 * Redirect target for auth failures (driver flow).
 * Set via enableSilentRefresh(). Null means silent refresh is not active.
 */
let failureRedirectPath: string | null = null

/**
 * Opt-in to silent refresh for the driver flow.
 * /x dispatcher flow never calls this, keeping its 401→clear→/x/login path unchanged.
 *
 * @param redirectPath Path to redirect on terminal refresh failure (e.g. '/d/login').
 */
export function enableSilentRefresh(redirectPath: string): void {
  failureRedirectPath = redirectPath
}

/** Disables silent refresh (resets the opt-in flag). */
export function disableSilentRefresh(): void {
  failureRedirectPath = null
}

/** Whether silent refresh is currently enabled. */
export function isSilentRefreshEnabled(): boolean {
  return failureRedirectPath !== null
}

/**
 * The configured redirect target for a terminal auth failure, or null if silent
 * refresh is not enabled. Role-aware: '/d/login' for drivers, '/c/login' for
 * customers, etc. client.ts's double-401 branch reads this so it redirects to the
 * caller's login rather than a hardcoded path (F2).
 */
export function getFailureRedirectPath(): string | null {
  return failureRedirectPath
}

/**
 * Perform a silent refresh using the stored refresh token.
 * Returns true on success, false on failure (storage already cleared).
 *
 * SINGLE-FLIGHT: concurrent calls share the same in-flight promise.
 */
export function silentRefresh(): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight
  }

  refreshInFlight = doRefresh().finally(() => {
    refreshInFlight = null
  })

  return refreshInFlight
}

async function doRefresh(): Promise<boolean> {
  // Prefer IDB token (stay-signed-in), fall back to localStorage
  const idbToken = await idbAuthStore.getRefreshToken()
  const refreshToken = idbToken ?? authStorage.getRefreshToken()

  if (!refreshToken) {
    return false
  }

  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      await handleRefreshFailure()
      return false
    }

    const data = (await response.json()) as { accessToken: string; refreshToken: string }

    // Preserve existing fleetSlug and userRole; only rotate the token pair
    const fleetSlug = authStorage.getFleetSlug() ?? ''
    const userRole = authStorage.getUserRole() ?? ''
    authStorage.setTokens(data.accessToken, data.refreshToken, fleetSlug, userRole)

    // Update IDB if we originally got the token from there (stay-signed-in)
    if (idbToken) {
      await idbAuthStore.setRefreshToken(data.refreshToken)
    }

    // Reschedule the proactive timer for the new access token so the chain continues
    // for long driver shifts (each 15-min token gets its own exp−2min probe).
    scheduleProactiveRefresh(data.accessToken)

    return true
  } catch {
    await handleRefreshFailure()
    return false
  }
}

async function handleRefreshFailure(): Promise<void> {
  authStorage.clear()
  await idbAuthStore.clear()

  if (failureRedirectPath && typeof window !== 'undefined') {
    window.location.href = failureRedirectPath
  }
}

/**
 * Decode a JWT payload without a library.
 * Returns null if the token is malformed.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    // Base64url → base64 → JSON
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64)
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

let proactiveTimerId: ReturnType<typeof setTimeout> | null = null

/**
 * Schedules a proactive refresh at (exp − 2 minutes) before the JWT expires.
 * Cancels any previously scheduled timer.
 * No-op if the token has no exp claim or is already expired.
 *
 * @param accessToken The current JWT access token.
 */
export function scheduleProactiveRefresh(accessToken: string): void {
  if (proactiveTimerId !== null) {
    clearTimeout(proactiveTimerId)
    proactiveTimerId = null
  }

  const payload = decodeJwtPayload(accessToken)
  if (!payload || typeof payload['exp'] !== 'number') return

  const expMs = (payload['exp'] as number) * 1000
  const triggerMs = expMs - 2 * 60 * 1000 // exp − 2 minutes
  const delayMs = triggerMs - Date.now()

  if (delayMs <= 0) return // Already past the trigger point

  proactiveTimerId = setTimeout(() => {
    proactiveTimerId = null
    void silentRefresh()
  }, delayMs)
}

/** Cancel any pending proactive refresh timer. */
export function cancelProactiveRefresh(): void {
  if (proactiveTimerId !== null) {
    clearTimeout(proactiveTimerId)
    proactiveTimerId = null
  }
}

/** Reset module-level state for testing purposes. */
export function _resetForTests(): void {
  refreshInFlight = null
  failureRedirectPath = null
  cancelProactiveRefresh()
}
