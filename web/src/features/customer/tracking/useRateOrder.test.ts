import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'

vi.mock('../../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/client')>(
    '../../../shared/api/client',
  )
  return { ...actual, getMyOrderHistory: vi.fn(), rateOrder: vi.fn() }
})

vi.mock('../../../shared/api/auth-storage', () => ({
  authStorage: { getAccessToken: vi.fn(() => 'tok') },
}))

import { getMyOrderHistory, rateOrder, ApiResponseError, type MyOrderHistoryResponse } from '../../../shared/api/client'
import { useRateOrder } from './useRateOrder'

const mockHistory = vi.mocked(getMyOrderHistory)
const mockRate = vi.mocked(rateOrder)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

function historyWith(stars: number | null): MyOrderHistoryResponse {
  return {
    items: [
      {
        id: 'order-9',
        publicCode: 'ABC123',
        status: 'Completed',
        pickupAddress: 'Hlavní 1',
        dropoffAddress: 'Náměstí 5',
        priceType: 'Fixed',
        fixedPriceCzk: 150,
        finalPriceCzk: 150,
        ratingStars: stars,
        createdAt: '2026-09-10T10:00:00Z',
        completedAt: '2026-09-10T10:20:00Z',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  }
}

describe('useRateOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves the order id by publicCode and shows the form when not yet rated', async () => {
    mockHistory.mockResolvedValue(historyWith(null))
    const { result } = renderHook(() => useRateOrder('ABC123'), { wrapper })

    await waitFor(() => expect(result.current.orderId).toBe('order-9'))
  })

  it('submits the rating for the resolved id and flips to thanks', async () => {
    mockHistory.mockResolvedValue(historyWith(null))
    mockRate.mockResolvedValue(undefined)
    const { result } = renderHook(() => useRateOrder('ABC123'), { wrapper })
    await waitFor(() => expect(result.current.orderId).toBe('order-9'))

    await act(async () => {
      await result.current.submit(4, 'Díky')
    })

    expect(mockRate).toHaveBeenCalledWith('order-9', { stars: 4, comment: 'Díky' })
    expect(result.current.view).toEqual({ kind: 'thanks', stars: 4 })
  })

  it('sends null comment when the comment is empty', async () => {
    mockHistory.mockResolvedValue(historyWith(null))
    mockRate.mockResolvedValue(undefined)
    const { result } = renderHook(() => useRateOrder('ABC123'), { wrapper })
    await waitFor(() => expect(result.current.orderId).toBe('order-9'))

    await act(async () => {
      await result.current.submit(5, '   ')
    })

    expect(mockRate).toHaveBeenCalledWith('order-9', { stars: 5, comment: null })
  })

  it('shows thanks (read-only) when the order is already rated', async () => {
    mockHistory.mockResolvedValue(historyWith(3))
    const { result } = renderHook(() => useRateOrder('ABC123'), { wrapper })

    await waitFor(() => expect(result.current.view).toEqual({ kind: 'thanks', stars: 3 }))
  })

  it('treats a 409 AlreadyRated as already-rated (thanks, not a crash)', async () => {
    mockHistory.mockResolvedValue(historyWith(null))
    mockRate.mockRejectedValueOnce(new ApiResponseError(409, { status: 409, title: 'x', type: 'x' }))
    const { result } = renderHook(() => useRateOrder('ABC123'), { wrapper })
    await waitFor(() => expect(result.current.orderId).toBe('order-9'))

    await act(async () => {
      await result.current.submit(2, '')
    })

    expect(result.current.view).toEqual({ kind: 'thanks', stars: 2 })
    expect(result.current.errorKey).toBeNull()
  })

  it('surfaces a generic error on a non-409 failure and stays on the form', async () => {
    mockHistory.mockResolvedValue(historyWith(null))
    mockRate.mockRejectedValueOnce(new ApiResponseError(500, { status: 500, title: 'x', type: 'x' }))
    const { result } = renderHook(() => useRateOrder('ABC123'), { wrapper })
    await waitFor(() => expect(result.current.orderId).toBe('order-9'))

    await act(async () => {
      await result.current.submit(2, '')
    })

    expect(result.current.view.kind).toBe('form')
    expect(result.current.errorKey).toBe('customer.rating.submitFailed')
  })
})
