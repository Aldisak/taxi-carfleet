import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mocks must be hoisted before imports
const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../../shared/api/auth-storage', () => ({
  authStorage: {
    getFleetSlug: vi.fn().mockReturnValue('test-fleet'),
    setTokens: vi.fn(),
    clear: vi.fn(),
    getAccessToken: vi.fn(),
    getRefreshToken: vi.fn(),
    getUserRole: vi.fn(),
  },
}))

vi.mock('../../../shared/api/idbAuthStore', () => ({
  idbAuthStore: {
    setRefreshToken: vi.fn(),
    clear: vi.fn(),
    getRefreshToken: vi.fn().mockResolvedValue(null),
  },
}))

vi.mock('../../../shared/api/refresh', () => ({
  enableSilentRefresh: vi.fn(),
  scheduleProactiveRefresh: vi.fn(),
  _resetForTests: vi.fn(),
}))

import { useDriverLogin } from './useDriverLogin'
import { authStorage } from '../../../shared/api/auth-storage'
import { idbAuthStore } from '../../../shared/api/idbAuthStore'
import { enableSilentRefresh } from '../../../shared/api/refresh'

const mockAuthStorage = authStorage as unknown as Record<string, ReturnType<typeof vi.fn>>
const mockIdbStore = idbAuthStore as unknown as Record<string, ReturnType<typeof vi.fn>>

describe('useDriverLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthStorage.getFleetSlug.mockReturnValue('prefilled-slug')
    vi.stubGlobal('fetch', vi.fn())
  })

  it('prefills fleetSlug from authStorage on mount', () => {
    const { result } = renderHook(() => useDriverLogin())
    expect(result.current.fleetSlug).toBe('prefilled-slug')
  })

  it('Driver role navigates to /d after successful login', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'at',
        refreshToken: 'rt',
        user: { id: 'u1', email: 'driver@taxi.cz', displayName: 'Jan', role: 'Driver' },
      }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useDriverLogin())

    await act(async () => {
      result.current.setFleetSlug('myfleet')
      result.current.setEmail('driver@taxi.cz')
      result.current.setPassword('pass123')
    })

    await act(async () => {
      const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent
      await result.current.handleSubmit(fakeEvent)
    })

    expect(mockNavigate).toHaveBeenCalledWith('/driver')
  })

  it('Dispatcher role navigates to /x after successful login', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'at',
        refreshToken: 'rt',
        user: { id: 'u2', email: 'disp@taxi.cz', displayName: 'Eva', role: 'Dispatcher' },
      }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useDriverLogin())

    await act(async () => {
      result.current.setFleetSlug('myfleet')
      result.current.setEmail('disp@taxi.cz')
      result.current.setPassword('pass123')
    })

    await act(async () => {
      const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent
      await result.current.handleSubmit(fakeEvent)
    })

    expect(mockNavigate).toHaveBeenCalledWith('/dispatcher')
  })

  it('staySignedIn=true stores refresh token in IndexedDB', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'at',
        refreshToken: 'rt-idb',
        user: { id: 'u1', email: 'driver@taxi.cz', displayName: 'Jan', role: 'Driver' },
      }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useDriverLogin())

    await act(async () => {
      result.current.setFleetSlug('myfleet')
      result.current.setEmail('driver@taxi.cz')
      result.current.setPassword('pass123')
      result.current.setStaySignedIn(true)
    })

    await act(async () => {
      const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent
      await result.current.handleSubmit(fakeEvent)
    })

    expect(mockIdbStore.setRefreshToken).toHaveBeenCalledWith('rt-idb')
  })

  it('invalid credentials (401) shows error message', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ title: 'Unauthorized' }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useDriverLogin())

    await act(async () => {
      result.current.setFleetSlug('myfleet')
      result.current.setEmail('bad@taxi.cz')
      result.current.setPassword('wrong')
    })

    await act(async () => {
      const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent
      await result.current.handleSubmit(fakeEvent)
    })

    expect(result.current.error).toBeTruthy()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('enableSilentRefresh is called after successful Driver login', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'at',
        refreshToken: 'rt',
        user: { id: 'u1', email: 'driver@taxi.cz', displayName: 'Jan', role: 'Driver' },
      }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useDriverLogin())

    await act(async () => {
      result.current.setFleetSlug('myfleet')
      result.current.setEmail('driver@taxi.cz')
      result.current.setPassword('pass123')
    })

    await act(async () => {
      const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent
      await result.current.handleSubmit(fakeEvent)
    })

    expect(enableSilentRefresh).toHaveBeenCalledWith('/driver/login')
  })
})
