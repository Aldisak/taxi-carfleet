import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { theme } from '../../../shared/theme/theme'

vi.mock('../../../shared/api/client', () => ({
  getPublicFleet: vi.fn(),
}))

import { getPublicFleet } from '../../../shared/api/client'
import { authStorage } from '../../../shared/api/auth-storage'
import { useFleetBranding } from './useFleetBranding'

const mockGetPublicFleet = vi.mocked(getPublicFleet)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

describe('useFleetBranding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('returns the base theme while the fleet is loading', () => {
    mockGetPublicFleet.mockReturnValue(new Promise(() => undefined))
    const { result } = renderHook(() => useFleetBranding(), { wrapper })
    expect(result.current.theme).toBe(theme)
  })

  it('applies the fleet primary color as a theme override once loaded', async () => {
    mockGetPublicFleet.mockResolvedValue({ name: 'Acme', phone: '+420111222333', primaryColorHex: '#ff8800', currency: 'CZK', timeZone: 'Europe/Prague' })
    const { result } = renderHook(() => useFleetBranding(), { wrapper })
    await waitFor(() => expect(result.current.theme.colors.primary).toBe('#ff8800'))
  })

  it('falls back to the theme primary token when primaryColorHex is null', async () => {
    mockGetPublicFleet.mockResolvedValue({ name: 'Acme', phone: '+420111222333', primaryColorHex: null, currency: 'CZK', timeZone: 'Europe/Prague' })
    const { result } = renderHook(() => useFleetBranding(), { wrapper })
    await waitFor(() => expect(result.current.fleet?.name).toBe('Acme'))
    expect(result.current.theme.colors.primary).toBe(theme.colors.primary)
  })

  it('exposes the fleet phone for the Zavolat button', async () => {
    mockGetPublicFleet.mockResolvedValue({ name: 'Acme', phone: '+420111222333', primaryColorHex: null, currency: 'CZK', timeZone: 'Europe/Prague' })
    const { result } = renderHook(() => useFleetBranding(), { wrapper })
    await waitFor(() => expect(result.current.fleet?.phone).toBe('+420111222333'))
  })

  it('persists the fleet phone for the Zavolat fallback once loaded (F1)', async () => {
    mockGetPublicFleet.mockResolvedValue({ name: 'Acme', phone: '+420111222333', primaryColorHex: null, currency: 'CZK', timeZone: 'Europe/Prague' })
    const { result } = renderHook(() => useFleetBranding(), { wrapper })
    await waitFor(() => expect(result.current.fleet?.phone).toBe('+420111222333'))
    expect(authStorage.getFleetPhone()).toBe('+420111222333')
  })
})
