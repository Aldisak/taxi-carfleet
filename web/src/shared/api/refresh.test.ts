import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'

/**
 * We reset modules before each test to clear module-level state
 * (the single-flight promise and retry flag).
 */
beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('refresh — single-flight mutex', () => {
  it('concurrent 401s result in exactly one /auth/refresh fetch call', async () => {
    // Arrange: stub fetch to return a valid token pair
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    // Stub authStorage
    const authStorage = { getRefreshToken: vi.fn().mockReturnValue('old-refresh'), setTokens: vi.fn(), clear: vi.fn(), getAccessToken: vi.fn(), getFleetSlug: vi.fn(), getUserRole: vi.fn() }
    vi.doMock('./auth-storage', () => ({ authStorage }))
    vi.doMock('./idbAuthStore', () => ({ idbAuthStore: { getRefreshToken: vi.fn().mockResolvedValue(null), setRefreshToken: vi.fn(), clear: vi.fn() } }))

    const { silentRefresh } = await import('./refresh')

    // Fire 3 concurrent refresh calls
    const [r1, r2, r3] = await Promise.all([
      silentRefresh(),
      silentRefresh(),
      silentRefresh(),
    ])

    // All should succeed
    expect(r1).toBe(true)
    expect(r2).toBe(true)
    expect(r3).toBe(true)

    // Only one fetch to /auth/refresh
    const refreshCalls = fetchSpy.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('/auth/refresh'),
    )
    expect(refreshCalls).toHaveLength(1)
  })
})

describe('refresh — proactive timer', () => {
  it('scheduleProactiveRefresh fires silentRefresh near token expiry', async () => {
    vi.useFakeTimers()

    const now = Math.floor(Date.now() / 1000)
    // Token expires in 3 minutes (180 seconds); timer should fire at exp - 2min = 60s from now
    const exp = now + 180

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'tok', refreshToken: 'rt' }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    // Create a minimal JWT with the given exp
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = btoa(JSON.stringify({ exp, sub: 'u1' }))
    const token = `${header}.${payload}.sig`

    vi.doMock('./auth-storage', () => ({
      authStorage: {
        getAccessToken: vi.fn().mockReturnValue(token),
        getRefreshToken: vi.fn().mockReturnValue('refresh-token'),
        setTokens: vi.fn(),
        clear: vi.fn(),
        getFleetSlug: vi.fn(),
        getUserRole: vi.fn(),
      },
    }))
    vi.doMock('./idbAuthStore', () => ({
      idbAuthStore: {
        getRefreshToken: vi.fn().mockResolvedValue(null),
        setRefreshToken: vi.fn(),
        clear: vi.fn(),
      },
    }))

    const { scheduleProactiveRefresh } = await import('./refresh')
    scheduleProactiveRefresh(token)

    // Before 60 seconds: no fetch yet
    vi.advanceTimersByTime(59_000)
    expect(fetchSpy).not.toHaveBeenCalled()

    // Advance past the 60-second mark
    await vi.advanceTimersByTimeAsync(2_000)

    expect(fetchSpy).toHaveBeenCalled()

    vi.useRealTimers()
  })
})

describe('refresh — retry-once semantics', () => {
  it('retry flag prevents recursion: failed refresh clears storage and returns false', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const authStorageMock = {
      getRefreshToken: vi.fn().mockReturnValue('old-refresh'),
      setTokens: vi.fn(),
      clear: vi.fn(),
      getAccessToken: vi.fn(),
      getFleetSlug: vi.fn(),
      getUserRole: vi.fn(),
    }
    vi.doMock('./auth-storage', () => ({ authStorage: authStorageMock }))
    const idbMock = { getRefreshToken: vi.fn().mockResolvedValue(null), setRefreshToken: vi.fn(), clear: vi.fn() }
    vi.doMock('./idbAuthStore', () => ({ idbAuthStore: idbMock }))

    const { silentRefresh } = await import('./refresh')

    const result = await silentRefresh()

    expect(result).toBe(false)
    expect(authStorageMock.clear).toHaveBeenCalled()
    // Only one fetch attempt — no infinite recursion
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('refresh — /x unchanged guard', () => {
  it('silentRefresh uses refresh token from localStorage (not IDB) when IDB has none', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'new-tok', refreshToken: 'new-rt' }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const authStorageMock = {
      getRefreshToken: vi.fn().mockReturnValue('ls-refresh'),
      setTokens: vi.fn(),
      clear: vi.fn(),
      getAccessToken: vi.fn(),
      getFleetSlug: vi.fn(),
      getUserRole: vi.fn(),
    }
    vi.doMock('./auth-storage', () => ({ authStorage: authStorageMock }))
    vi.doMock('./idbAuthStore', () => ({
      idbAuthStore: {
        getRefreshToken: vi.fn().mockResolvedValue(null),
        setRefreshToken: vi.fn(),
        clear: vi.fn(),
      },
    }))

    const { silentRefresh } = await import('./refresh')
    const result = await silentRefresh()

    expect(result).toBe(true)
    // The fetch was called with the localStorage token
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as { refreshToken: string }
    expect(body.refreshToken).toBe('ls-refresh')
  })
})
