import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We import authStorage and apiRequest directly; they use localStorage and fetch.
// Since vitest uses jsdom, localStorage is available.

describe('apiRequest — 401 handling', () => {
  const originalLocation = window.location

  beforeEach(() => {
    // Stub window.location.href assignment
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'http://localhost/' },
    })

    // Clear storage
    localStorage.clear()
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('clears auth storage and redirects to /x/login on 401', async () => {
    // Seed some values in localStorage
    localStorage.setItem('auth.accessToken', 'some-token')
    localStorage.setItem('auth.refreshToken', 'some-refresh')
    localStorage.setItem('auth.fleetSlug', 'test-fleet')

    // Mock fetch to return 401
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      statusText: 'Unauthorized',
    }))

    const { apiRequest } = await import('./client')

    // Fire and forget — the function returns a never-resolved promise on 401
    // We don't await it; we just need to trigger the redirect logic
    const requestPromise = apiRequest('/some-protected-endpoint')

    // Wait a tick for the microtask to flush
    await new Promise(resolve => setTimeout(resolve, 0))

    // Assert redirect happened
    expect(window.location.href).toBe('/x/login')

    // Assert storage was cleared
    expect(localStorage.getItem('auth.accessToken')).toBeNull()
    expect(localStorage.getItem('auth.refreshToken')).toBeNull()
    expect(localStorage.getItem('auth.fleetSlug')).toBeNull()

    // The promise never resolves; this is expected behavior
    void requestPromise
  })

  it('does NOT redirect when skipAuthRedirect is true (login endpoint)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      statusText: 'Unauthorized',
      json: vi.fn().mockResolvedValue({
        status: 401,
        title: 'Unauthorized',
        type: 'https://httpstatuses.com/401',
      }),
    }))

    const { apiRequest, ApiResponseError } = await import('./client')

    let thrown: unknown
    try {
      await apiRequest('/auth/staff/login', { skipAuthRedirect: true })
    } catch (err) {
      thrown = err
    }

    // Should throw ApiResponseError, NOT redirect
    expect(thrown).toBeInstanceOf(ApiResponseError)
    expect(window.location.href).not.toBe('/x/login')
  })
})

describe('getCommonRoutes — envelope unwrap (laneB4f AC#1 regression)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  // REGRESSION: the real A-common-routes backend returns a NAMED `{ routes: [...] }`
  // envelope (ListCommonRoutesResponse), NOT the `{ items }` list convention. The client
  // previously typed `{ items }` and read `.items`, yielding `[]` on the real payload ->
  // a logged-out Home with zero route cards -> AC#1 (three-tap common route) impossible.
  // This tests the client mapping against the REAL shape (mocked fetch), so a future
  // regression to `.items` fails here rather than only in e2e.
  it('unwraps a { routes: [...] } payload to the route array', async () => {
    const realPayload = {
      routes: [
        { id: 'r1', name: 'Nádraží → Centrum', type: 'PointToPoint', priceCzk: 110 },
        { id: 'r2', name: 'Letiště → Centrum', type: 'PointToPoint', priceCzk: 450 },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(realPayload),
    }))

    const { getCommonRoutes } = await import('./client')
    const routes = await getCommonRoutes()

    expect(Array.isArray(routes)).toBe(true)
    expect(routes).toHaveLength(2)
    expect(routes[0]!.id).toBe('r1')
    expect(routes[0]!.name).toBe('Nádraží → Centrum')
    expect(routes[1]!.priceCzk).toBe(450)
  })

  it('returns an empty array when the backend sends { routes: [] }', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue({ routes: [] }),
    }))

    const { getCommonRoutes } = await import('./client')
    const routes = await getCommonRoutes()

    expect(routes).toEqual([])
  })
})
