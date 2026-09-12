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
