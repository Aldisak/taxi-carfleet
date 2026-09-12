import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

vi.mock('../../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/client')>(
    '../../../shared/api/client',
  )
  return { ...actual, postCancelOrder: vi.fn() }
})

import { postCancelOrder, ApiResponseError } from '../../../shared/api/client'
import { useCancelOrder } from './useCancelOrder'

const mockCancel = vi.mocked(postCancelOrder)

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

describe('useCancelOrder', () => {
  beforeEach(() => mockCancel.mockReset())

  it('posts cancel with the customer reason text', async () => {
    mockCancel.mockResolvedValue({ order: {} as never })
    const { result } = renderHook(() => useCancelOrder('order-1'), { wrapper: makeWrapper() })

    await act(async () => {
      await result.current.cancel()
    })
    expect(mockCancel).toHaveBeenCalledWith('order-1', expect.any(String))
  })

  it('surfaces a Czech error key on a 409 (cannot cancel anymore)', async () => {
    // mockRejectedValueOnce (not …Value) creates the rejected promise only when cancel() calls it,
    // so it is consumed in the same tick — no dangling rejection (mirrors useOfferAccept.test.ts).
    mockCancel.mockRejectedValueOnce(new ApiResponseError(409, { status: 409, title: 'Conflict', type: '' }))
    const { result } = renderHook(() => useCancelOrder('order-1'), { wrapper: makeWrapper() })

    await act(async () => {
      await result.current.cancel()
    })
    expect(result.current.errorKey).toBe('customer.tracking.cancelTooLate')
  })

  it('does not attempt to cancel when there is no order id', async () => {
    const { result } = renderHook(() => useCancelOrder(null), { wrapper: makeWrapper() })
    await act(async () => {
      await result.current.cancel()
    })
    expect(mockCancel).not.toHaveBeenCalled()
  })
})
