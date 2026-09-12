import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'

/**
 * Tests that the 401-retry pipeline in apiRequest correctly:
 * 1. When silent refresh is enabled (driver flow): retries the request once after refresh.
 * 2. When silent refresh is disabled (dispatcher flow): clears and redirects to /x/login (unchanged).
 */

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('apiRequest — driver 401 retry pipeline', () => {
  it('retries request once after successful silent refresh when driver flow is enabled', async () => {
    let callCount = 0
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ accessToken: 'new-at', refreshToken: 'new-rt' }),
        })
      }
      callCount++
      if (callCount === 1) {
        // First call → 401
        return Promise.resolve({ ok: false, status: 401, json: async () => ({}) })
      }
      // Second call → 200
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ result: 'ok' }),
      })
    })
    vi.stubGlobal('fetch', fetchSpy)

    vi.doMock('./auth-storage', () => ({
      authStorage: {
        getAccessToken: vi.fn().mockReturnValue('old-at'),
        getRefreshToken: vi.fn().mockReturnValue('old-rt'),
        getFleetSlug: vi.fn().mockReturnValue('fleet'),
        getUserRole: vi.fn().mockReturnValue('Driver'),
        setTokens: vi.fn(),
        clear: vi.fn(),
      },
    }))
    vi.doMock('./idbAuthStore', () => ({
      idbAuthStore: {
        getRefreshToken: vi.fn().mockResolvedValue(null),
        setRefreshToken: vi.fn(),
        clear: vi.fn(),
      },
    }))
    vi.doMock('./refresh', async () => {
      const actual = await vi.importActual<typeof import('./refresh')>('./refresh')
      actual.enableSilentRefresh('/d/login')
      return actual
    })

    const { apiRequest } = await import('./client')
    const result = await apiRequest<{ result: string }>('/some-driver-endpoint')

    expect(result).toEqual({ result: 'ok' })
    // Two calls to the endpoint (1st got 401, 2nd succeeded after refresh)
    const endpointCalls = fetchSpy.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('/some-driver-endpoint'),
    )
    expect(endpointCalls).toHaveLength(2)
  })
})

describe('apiRequest — driver 401 retry still 401', () => {
  it('when retry itself returns 401 (driver flow), clears both stores and redirects to /d/login', async () => {
    let callCount = 0
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ accessToken: 'new-at', refreshToken: 'new-rt' }),
        })
      }
      callCount++
      // Both first AND second call to the real endpoint → 401
      return Promise.resolve({ ok: false, status: 401, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const clearMock = vi.fn()
    const idbClearMock = vi.fn().mockResolvedValue(undefined)
    vi.doMock('./auth-storage', () => ({
      authStorage: {
        getAccessToken: vi.fn().mockReturnValue('old-at'),
        getRefreshToken: vi.fn().mockReturnValue('old-rt'),
        getFleetSlug: vi.fn().mockReturnValue('fleet'),
        getUserRole: vi.fn().mockReturnValue('Driver'),
        setTokens: vi.fn(),
        clear: clearMock,
      },
    }))
    vi.doMock('./idbAuthStore', () => ({
      idbAuthStore: {
        getRefreshToken: vi.fn().mockResolvedValue(null),
        setRefreshToken: vi.fn(),
        clear: idbClearMock,
      },
    }))
    vi.doMock('./refresh', async () => {
      const actual = await vi.importActual<typeof import('./refresh')>('./refresh')
      actual.enableSilentRefresh('/d/login')
      return actual
    })

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    })

    const { apiRequest } = await import('./client')

    let settled = false
    apiRequest<void>('/some-driver-endpoint').then(() => { settled = true }).catch(() => { settled = true })

    await new Promise(r => setTimeout(r, 50))

    // Both auth stores must be cleared
    expect(clearMock).toHaveBeenCalled()
    expect(idbClearMock).toHaveBeenCalled()
    // Redirect must be to the DRIVER login page, NOT /x/login
    expect(window.location.href).toBe('/d/login')
    expect(settled).toBe(false) // never-resolved promise
    // Endpoint was called twice (initial + retry)
    expect(callCount).toBe(2)
  })
})

describe('apiRequest — dispatcher 401 path unchanged', () => {
  it('when silent refresh is NOT enabled, 401 clears storage and navigates to /x/login', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const clearMock = vi.fn()
    vi.doMock('./auth-storage', () => ({
      authStorage: {
        getAccessToken: vi.fn().mockReturnValue('at'),
        getRefreshToken: vi.fn().mockReturnValue('rt'),
        getFleetSlug: vi.fn().mockReturnValue('fleet'),
        getUserRole: vi.fn().mockReturnValue('Dispatcher'),
        setTokens: vi.fn(),
        clear: clearMock,
      },
    }))
    vi.doMock('./idbAuthStore', () => ({
      idbAuthStore: {
        getRefreshToken: vi.fn().mockResolvedValue(null),
        setRefreshToken: vi.fn(),
        clear: vi.fn(),
      },
    }))
    // Do NOT enable silent refresh — dispatcher path
    vi.doMock('./refresh', () => ({
      isSilentRefreshEnabled: vi.fn().mockReturnValue(false),
      silentRefresh: vi.fn(),
      enableSilentRefresh: vi.fn(),
      scheduleProactiveRefresh: vi.fn(),
      _resetForTests: vi.fn(),
      disableSilentRefresh: vi.fn(),
      cancelProactiveRefresh: vi.fn(),
    }))

    const originalHref = window.location.href
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: originalHref },
    })

    const { apiRequest } = await import('./client')

    // apiRequest with skipAuthRedirect=false (default) returns never-resolved promise on 401
    let settled = false
    apiRequest<void>('/dispatcher-endpoint').then(() => { settled = true }).catch(() => { settled = true })

    // Give it a tick
    await new Promise(r => setTimeout(r, 10))

    expect(clearMock).toHaveBeenCalled()
    expect(window.location.href).toBe('/x/login')
    expect(settled).toBe(false) // never resolved
  })
})
