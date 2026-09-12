import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'

vi.mock('../../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/client')>('../../../shared/api/client')
  return { ...actual, getPriceQuote: vi.fn() }
})

import { getPriceQuote, ApiResponseError } from '../../../shared/api/client'
import { usePriceQuote } from './usePriceQuote'

const mockQuote = vi.mocked(getPriceQuote)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

describe('usePriceQuote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('auth.accessToken', 'customer-token')
  })

  it('does not query without pickup coords', () => {
    renderHook(() => usePriceQuote({ pickupLat: null, pickupLng: null, dropoffLat: null, dropoffLng: null }), { wrapper })
    expect(mockQuote).not.toHaveBeenCalled()
  })

  it('does not query when logged out (pricing/quote is CustomerOnly)', () => {
    localStorage.removeItem('auth.accessToken')
    renderHook(() => usePriceQuote({ pickupLat: 50.08, pickupLng: 14.42, dropoffLat: null, dropoffLng: null }), { wrapper })
    expect(mockQuote).not.toHaveBeenCalled()
  })

  it('interprets a Fixed quote into a fixed view', async () => {
    mockQuote.mockResolvedValue({ priceType: 'Fixed', fixedPriceCzk: 300, estimateLowCzk: null, estimateHighCzk: null })
    const { result } = renderHook(
      () => usePriceQuote({ pickupLat: 50.08, pickupLng: 14.42, dropoffLat: 50.07, dropoffLng: 14.43 }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.view?.kind).toBe('fixed'))
    if (result.current.view?.kind === 'fixed') expect(result.current.view.priceCzk).toBe(300)
  })

  it('surfaces the "cannot compute" message on a 502', async () => {
    mockQuote.mockRejectedValue(
      new ApiResponseError(502, { status: 502, title: 'Bad Gateway', type: '' }),
    )
    const { result } = renderHook(
      () => usePriceQuote({ pickupLat: 50.08, pickupLng: 14.42, dropoffLat: 50.07, dropoffLng: 14.43 }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.errorKey).toBe('customer.custom.quoteUnavailable'))
  })
})
