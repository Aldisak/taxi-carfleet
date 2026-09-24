import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useOrderFormPlaces } from './useOrderFormPlaces'
import { QUICK_CHIPS } from './quickChips'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getPlaces: vi.fn().mockResolvedValue([]),
  }
})

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useOrderFormPlaces', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the fleet enabled Places (as chips) when the query resolves with data', async () => {
    const { getPlaces } = await import('../../shared/api/client')
    vi.mocked(getPlaces).mockResolvedValue([
      { id: 'p1', name: 'Nádraží Kolín', address: 'Nádraží, Kolín', lat: 50.0281, lng: 15.2006, sortOrder: 0, isEnabled: true },
      { id: 'p2', name: 'Kutná Hora hl.n.', address: 'Kutná Hora hl.n.', lat: 49.9469, lng: 15.2674, sortOrder: 1, isEnabled: true },
    ])

    const { result } = renderHook(() => useOrderFormPlaces(), { wrapper })

    await waitFor(() => {
      expect(result.current.map(c => c.label)).toContain('Nádraží Kolín')
    })
    expect(result.current.map(c => c.label)).not.toContain('Vlakové nádraží Kolín')
  })

  it('filters out disabled Places', async () => {
    const { getPlaces } = await import('../../shared/api/client')
    vi.mocked(getPlaces).mockResolvedValue([
      { id: 'p1', name: 'Nádraží Kolín', address: 'Nádraží, Kolín', lat: 50.0281, lng: 15.2006, sortOrder: 0, isEnabled: true },
      { id: 'p2', name: 'Skrytý', address: 'Skrytý', lat: 1, lng: 2, sortOrder: 1, isEnabled: false },
    ])

    const { result } = renderHook(() => useOrderFormPlaces(), { wrapper })

    await waitFor(() => {
      expect(result.current.map(c => c.label)).toContain('Nádraží Kolín')
    })
    expect(result.current.map(c => c.label)).not.toContain('Skrytý')
  })

  it('falls back to QUICK_CHIPS when the query returns an empty list', async () => {
    const { getPlaces } = await import('../../shared/api/client')
    vi.mocked(getPlaces).mockResolvedValue([])

    const { result } = renderHook(() => useOrderFormPlaces(), { wrapper })

    await waitFor(() => {
      expect(result.current.map(c => c.label)).toEqual([...QUICK_CHIPS].map(c => c.label))
    })
  })

  it('falls back to QUICK_CHIPS synchronously on the first render (no chips flicker)', () => {
    const { result } = renderHook(() => useOrderFormPlaces(), { wrapper })
    // Before any query resolves the fallback chips are already present.
    expect(result.current.length).toBeGreaterThan(0)
  })
})
