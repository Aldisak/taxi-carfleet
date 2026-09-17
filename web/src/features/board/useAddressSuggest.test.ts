import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAddressSuggest } from './useAddressSuggest'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getGeoSuggest: vi.fn(),
  }
})

describe('useAddressSuggest — debounce logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not call getGeoSuggest when query is shorter than 3 chars', async () => {
    const { getGeoSuggest } = await import('../../shared/api/client')
    vi.mocked(getGeoSuggest).mockResolvedValue({ items: [] })

    renderHook(() => useAddressSuggest('ab'))

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(getGeoSuggest).not.toHaveBeenCalled()
  })

  it('calls getGeoSuggest once after debounce settles despite rapid typing', async () => {
    const { getGeoSuggest } = await import('../../shared/api/client')
    vi.mocked(getGeoSuggest).mockResolvedValue({ items: [{ name: 'Praha', label: 'Obec', lat: 50.08, lng: 14.43 }] })

    const { rerender } = renderHook(({ q }: { q: string }) => useAddressSuggest(q), {
      initialProps: { q: 'Pr' },
    })

    // Rapidly type more characters (before debounce fires)
    rerender({ q: 'Pra' })
    rerender({ q: 'Prah' })
    rerender({ q: 'Praha' })

    // Advance past debounce delay
    await act(async () => {
      vi.advanceTimersByTime(400)
      await Promise.resolve()
      await Promise.resolve()
    })

    // Despite 4 rerenders, getGeoSuggest called exactly once with the final value
    expect(getGeoSuggest).toHaveBeenCalledTimes(1)
    expect(getGeoSuggest).toHaveBeenCalledWith('Praha')
  })

  it('returns suggestions in items after debounce resolves', async () => {
    const { getGeoSuggest } = await import('../../shared/api/client')
    vi.mocked(getGeoSuggest).mockResolvedValue({
      items: [{ name: 'Kolín nádraží', label: 'Adresa', lat: 50.027, lng: 15.2 }],
    })

    const { result } = renderHook(() => useAddressSuggest('Kolín'))

    await act(async () => {
      vi.advanceTimersByTime(400)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0]!.name).toBe('Kolín nádraží')
  })
})
