import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useUpdateOrder } from './useUpdateOrder'
import * as client from '../../shared/api/client'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof client>()
  return {
    ...original,
    patchOrder: vi.fn(),
  }
})

const mockPatchOrder = vi.mocked(client.patchOrder)

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useUpdateOrder — PATCH payload and 409 handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends the version in the PATCH body', async () => {
    const mockOrder = { id: 'order-1', version: 2 } as client.OrderDetailDto
    mockPatchOrder.mockResolvedValueOnce(mockOrder)

    const { result } = renderHook(() => useUpdateOrder(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({
      orderId: 'order-1',
      fields: { note: 'test note' },
      version: 1,
    })

    await waitFor(() => expect(mockPatchOrder).toHaveBeenCalled())

    expect(mockPatchOrder).toHaveBeenCalledWith('order-1', {
      note: 'test note',
      version: 1,
    })
  })

  it('calls onSuccess with the updated order on success', async () => {
    const mockOrder = { id: 'order-1', version: 2 } as client.OrderDetailDto
    mockPatchOrder.mockResolvedValueOnce(mockOrder)

    const onSuccess = vi.fn()
    const { result } = renderHook(() => useUpdateOrder(onSuccess), {
      wrapper: createWrapper(),
    })

    result.current.mutate({
      orderId: 'order-1',
      fields: { note: 'updated' },
      version: 1,
    })

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(mockOrder))
  })

  it('sets isConflict=true on status 409', async () => {
    const conflictError = new client.ApiResponseError(409, {
      status: 409,
      title: 'Conflict',
      type: 'https://httpstatuses.com/409',
      errors: [{ name: 'Order', reason: 'StaleVersion', code: 'Order.StaleVersion' }],
    })
    mockPatchOrder.mockRejectedValueOnce(conflictError)

    const { result } = renderHook(() => useUpdateOrder(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({
      orderId: 'order-1',
      fields: {},
      version: 0,
    })

    await waitFor(() => expect(result.current.isConflict).toBe(true))
  })

  it('calls onConflict callback on status 409', async () => {
    const conflictError = new client.ApiResponseError(409, {
      status: 409,
      title: 'Conflict',
      type: 'https://httpstatuses.com/409',
    })
    mockPatchOrder.mockRejectedValueOnce(conflictError)

    const onConflict = vi.fn()
    const { result } = renderHook(() => useUpdateOrder(undefined, onConflict), {
      wrapper: createWrapper(),
    })

    result.current.mutate({
      orderId: 'order-1',
      fields: {},
      version: 0,
    })

    await waitFor(() => expect(onConflict).toHaveBeenCalled())
  })
})
