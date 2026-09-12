const KEYS = {
  accessToken: 'auth.accessToken',
  refreshToken: 'auth.refreshToken',
  fleetSlug: 'auth.fleetSlug',
  userRole: 'auth.userRole',
  /**
   * Public fleet phone cached for the "Zavolat" fallback (F1). Deliberately NOT under
   * the auth.* namespace and NOT wiped by clear(): it is public branding, and the whole
   * point is that a number still shows on a cold/offline launch or after a logout.
   */
  fleetPhone: 'fleet.phone',
} as const

export const authStorage = {
  getAccessToken(): string | null {
    return localStorage.getItem(KEYS.accessToken)
  },
  getRefreshToken(): string | null {
    return localStorage.getItem(KEYS.refreshToken)
  },
  getFleetSlug(): string | null {
    return localStorage.getItem(KEYS.fleetSlug)
  },
  getUserRole(): string | null {
    return localStorage.getItem(KEYS.userRole)
  },
  /**
   * Persist the fleet slug without touching tokens. Used by the customer PWA (F-05)
   * to record the URL-resolved slug before any logged-out public API call, because
   * client.ts auto-attaches X-Fleet-Slug from this value.
   */
  setFleetSlug(fleetSlug: string): void {
    localStorage.setItem(KEYS.fleetSlug, fleetSlug)
  },
  /**
   * Cache the public fleet phone for the Zavolat fallback (F1). Survives clear() so a
   * number always shows once known — on cold start, failed public/fleet, or offline.
   */
  setFleetPhone(phone: string): void {
    localStorage.setItem(KEYS.fleetPhone, phone)
  },
  getFleetPhone(): string | null {
    return localStorage.getItem(KEYS.fleetPhone)
  },
  setTokens(accessToken: string, refreshToken: string, fleetSlug: string, userRole: string): void {
    localStorage.setItem(KEYS.accessToken, accessToken)
    localStorage.setItem(KEYS.refreshToken, refreshToken)
    localStorage.setItem(KEYS.fleetSlug, fleetSlug)
    localStorage.setItem(KEYS.userRole, userRole)
  },
  clear(): void {
    localStorage.removeItem(KEYS.accessToken)
    localStorage.removeItem(KEYS.refreshToken)
    localStorage.removeItem(KEYS.fleetSlug)
    localStorage.removeItem(KEYS.userRole)
  },
}
