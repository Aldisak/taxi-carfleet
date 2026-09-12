const KEYS = {
  accessToken: 'auth.accessToken',
  refreshToken: 'auth.refreshToken',
  fleetSlug: 'auth.fleetSlug',
  userRole: 'auth.userRole',
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
