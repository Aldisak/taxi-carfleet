import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'

vi.mock('../../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/client')>(
    '../../../shared/api/client',
  )
  return { ...actual, getMyOrderHistory: vi.fn() }
})

const getToken = vi.fn(() => 'tok' as string | null)
vi.mock('../../../shared/api/auth-storage', () => ({
  authStorage: { getAccessToken: () => getToken() },
}))

import { getMyOrderHistory, type MyOrderHistoryResponse } from '../../../shared/api/client'
import { useMyOrderHistory } from './useMyOrderHistory'

const mockHistory = vi.mocked(getMyOrderHistory)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

const page: MyOrderHistoryResponse = {
  items: [
    {
      id: 'o1',
      publicCode: 'ABC123',
      status: 'Completed',
      pickupAddress: 'Hlavní 1',
      dropoffAddress: 'Náměstí 5',
      priceType: 'Fixed',
      fixedPriceCzk: 150,
      finalPriceCzk: 150,
      ratingStars: 4,
      createdAt: '2026-09-10T08:00:00Z',
      completedAt: '2026-09-10T08:20:00Z',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
}

describe('useMyOrderHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getToken.mockReturnValue('tok')
  })

  it('loads the first page of the history list', async () => {
    mockHistory.mockResolvedValue(page)
    const { result } = renderHook(() => useMyOrderHistory(), { wrapper })

    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.items[0].publicCode).toBe('ABC123')
    expect(mockHistory).toHaveBeenCalledWith(1, 20)
  })

  it('does not fetch when logged out (no token → would 401/redirect)', () => {
    getToken.mockReturnValue(null)
    mockHistory.mockResolvedValue(page)
    renderHook(() => useMyOrderHistory(), { wrapper })

    expect(mockHistory).not.toHaveBeenCalled()
  })
})
