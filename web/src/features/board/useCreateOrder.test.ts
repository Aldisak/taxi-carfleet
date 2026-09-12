import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { toCreateOrderRequest, useCreateOrder, useNewOrderHighlightStore } from './useCreateOrder'
import * as client from '../../shared/api/client'
import type { OrderFormValues } from './orderFormSchema'

// ---------------------------------------------------------------------------
// Mock the API client
// ---------------------------------------------------------------------------

vi.mock('../../shared/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof client>()
  return {
    ...original,
    postCreateOrder: vi.fn(),
  }
})

const mockPostCreateOrder = vi.mocked(client.postCreateOrder)

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

function makeFormValues(overrides?: Partial<OrderFormValues>): OrderFormValues {
  return {
    phone: '777123456',
    name: 'Jan Novák',
    pickup: { address: 'Nádraží Kolín', lat: 50.0271, lng: 15.2005 },
    dropoff: { address: '', lat: null, lng: null },
    asap: true,
    scheduledAt: '',
    passengers: 1,
    note: '',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// toCreateOrderRequest — pure function tests
// ---------------------------------------------------------------------------

describe('toCreateOrderRequest — submit payload shape', () => {
  it('normalizes bare 9-digit Czech phone to E.164', () => {
    const req = toCreateOrderRequest(makeFormValues({ phone: '777123456' }), null)
    expect(req.customerPhone).toBe('+420777123456')
  })

  it('passes through E.164 phone unchanged', () => {
    const req = toCreateOrderRequest(makeFormValues({ phone: '+420777123456' }), null)
    expect(req.customerPhone).toBe('+420777123456')
  })

  it('includes pickup address and coords', () => {
    const req = toCreateOrderRequest(makeFormValues(), null)
    expect(req.pickupAddress).toBe('Nádraží Kolín')
    expect(req.pickupLat).toBe(50.0271)
    expect(req.pickupLng).toBe(15.2005)
  })

  it('sets dropoff to null when not provided', () => {
    const req = toCreateOrderRequest(makeFormValues(), null)
    expect(req.dropoffAddress).toBeNull()
    expect(req.dropoffLat).toBeNull()
    expect(req.dropoffLng).toBeNull()
  })

  it('includes dropoff when provided', () => {
    const req = toCreateOrderRequest(
      makeFormValues({
        dropoff: { address: 'Hotel Praha', lat: 49.946, lng: 15.267 },
      }),
      null,
    )
    expect(req.dropoffAddress).toBe('Hotel Praha')
    expect(req.dropoffLat).toBe(49.946)
    expect(req.dropoffLng).toBe(15.267)
  })

  it('sets scheduledAt to null for ASAP orders', () => {
    const req = toCreateOrderRequest(makeFormValues({ asap: true, scheduledAt: '' }), null)
    expect(req.scheduledAt).toBeNull()
  })

  it('includes scheduledAt for scheduled orders', () => {
    const future = new Date(Date.now() + 3600_000).toISOString()
    const req = toCreateOrderRequest(makeFormValues({ asap: false, scheduledAt: future }), null)
    expect(req.scheduledAt).toBe(future)
  })

  it('sets priceType to Estimate when estimatedPriceCzk is present', () => {
    const req = toCreateOrderRequest(makeFormValues(), 220)
    expect(req.priceType).toBe('Estimate')
    expect(req.estimatedPriceCzk).toBe(220)
  })

  it('sets priceType to Meter when estimatedPriceCzk is null', () => {
    const req = toCreateOrderRequest(makeFormValues(), null)
    expect(req.priceType).toBe('Meter')
    expect(req.estimatedPriceCzk).toBeNull()
  })

  it('includes passengers count', () => {
    const req = toCreateOrderRequest(makeFormValues({ passengers: 3 }), null)
    expect(req.passengers).toBe(3)
  })

  it('sets note to null when empty', () => {
    const req = toCreateOrderRequest(makeFormValues({ note: '' }), null)
    expect(req.note).toBeNull()
  })

  it('includes non-empty note', () => {
    const req = toCreateOrderRequest(makeFormValues({ note: 'Pozn. test' }), null)
    expect(req.note).toBe('Pozn. test')
  })

  it('strips spaces from phone before normalizing', () => {
    const req = toCreateOrderRequest(makeFormValues({ phone: '777 123 456' }), null)
    expect(req.customerPhone).toBe('+420777123456')
  })
})

// ---------------------------------------------------------------------------
// useCreateOrder — mutation hook tests (F3)
// ---------------------------------------------------------------------------

describe('useCreateOrder — mutation hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the highlight store before each test
    useNewOrderHighlightStore.setState({ highlight: null })
  })

  it('on success: invalidates [orders] cache key', async () => {
    mockPostCreateOrder.mockResolvedValueOnce({ order: { id: 'new-order-id' } } as never)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(() => useCreateOrder(), { wrapper })

    const req = toCreateOrderRequest(makeFormValues(), null)
    await act(async () => {
      result.current.mutate(req)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['orders'] }),
    )
  })

  it('on success: sets highlight store with the new order id', async () => {
    const newOrderId = 'new-order-456'
    mockPostCreateOrder.mockResolvedValueOnce({ order: { id: newOrderId } } as never)

    const { result } = renderHook(() => useCreateOrder(), { wrapper: createWrapper() })

    const req = toCreateOrderRequest(makeFormValues(), null)
    await act(async () => {
      result.current.mutate(req)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const highlight = useNewOrderHighlightStore.getState().highlight
    expect(highlight).not.toBeNull()
    expect(highlight!.orderId).toBe(newOrderId)
    expect(typeof highlight!.createdAt).toBe('number')
  })
})
