import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useMyOrders } from './useMyOrders'
import type { MyOrder } from '../../../shared/api/client'

vi.mock('../../../shared/api/client', () => ({
  getDriverMyOrders: vi.fn(),
}))

import { getDriverMyOrders } from '../../../shared/api/client'
const mockGet = vi.mocked(getDriverMyOrders)

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client }, children)
}

describe('useMyOrders', () => {
  beforeEach(() => { mockGet.mockReset() })

  it('unwraps the { orders } envelope and exposes the ride array', async () => {
    const orders: MyOrder[] = [
      {
        id: '1', publicCode: 'A-1', status: 'Completed', pickupAddress: 'P',
        dropoffAddress: 'D', priceType: 'Fixed', finalPriceCzk: 100,
        paymentType: 'Cash', completedAt: '2026-09-12T10:00:00Z',
      },
    ]
    mockGet.mockResolvedValue({ orders })

    const { result } = renderHook(() => useMyOrders('2026-09-12'), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual(orders)
    expect(mockGet).toHaveBeenCalledWith('2026-09-12')
  })
})
