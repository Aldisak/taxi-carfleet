import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { ApiResponseError } from '../../../shared/api/client'

// Mock the postAcceptOrder function
vi.mock('../../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/client')>('../../../shared/api/client')
  return {
    ...actual,
    postAcceptOrder: vi.fn(),
  }
})

import { postAcceptOrder } from '../../../shared/api/client'
import { useOfferAccept } from './useOfferAccept'

const mockPostAcceptOrder = vi.mocked(postAcceptOrder)

describe('useOfferAccept', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns success outcome on 200/204', async () => {
    mockPostAcceptOrder.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useOfferAccept())

    let outcome
    await act(async () => {
      outcome = await result.current.accept('order-1')
    })
    expect(outcome).toEqual({ type: 'success' })
  })

  it('returns stale on 404 (F-08: offer reassigned/timed out)', async () => {
    const err = new ApiResponseError(404, { status: 404, title: 'Not Found', type: '' })
    mockPostAcceptOrder.mockRejectedValueOnce(err)
    const { result } = renderHook(() => useOfferAccept())

    let outcome
    await act(async () => {
      outcome = await result.current.accept('order-1')
    })
    expect(outcome).toEqual({ type: 'stale' })
  })

  it('returns stale on 409 (F-08: conflict — also stale)', async () => {
    const err = new ApiResponseError(409, { status: 409, title: 'Conflict', type: '' })
    mockPostAcceptOrder.mockRejectedValueOnce(err)
    const { result } = renderHook(() => useOfferAccept())

    let outcome
    await act(async () => {
      outcome = await result.current.accept('order-1')
    })
    expect(outcome).toEqual({ type: 'stale' })
  })

  it('returns offline on network error (TypeError)', async () => {
    mockPostAcceptOrder.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useOfferAccept())

    let outcome
    await act(async () => {
      outcome = await result.current.accept('order-1')
    })
    expect(outcome).toEqual({ type: 'offline' })
  })

  it('double-tap guard: second call while first is in-flight returns noop (exactly one POST)', async () => {
    let resolveFirst!: () => void
    const firstPromise = new Promise<void>(resolve => { resolveFirst = resolve })
    mockPostAcceptOrder.mockReturnValueOnce(firstPromise)

    const { result } = renderHook(() => useOfferAccept())

    let outcome1: Awaited<ReturnType<typeof result.current.accept>> | undefined
    let outcome2: Awaited<ReturnType<typeof result.current.accept>> | undefined

    // Start first accept — don't await yet
    const p1 = act(async () => { outcome1 = await result.current.accept('order-1') })

    // Second tap immediately (synchronous, in-flight)
    await act(async () => { outcome2 = await result.current.accept('order-1') })

    // Resolve first request
    resolveFirst()
    await p1

    expect(outcome2).toEqual({ type: 'noop' })
    expect(mockPostAcceptOrder).toHaveBeenCalledTimes(1)
    expect(outcome1).toEqual({ type: 'success' })
  })

  it('isPending starts false and ends false after success', async () => {
    mockPostAcceptOrder.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useOfferAccept())
    expect(result.current.isPending).toBe(false)

    await act(async () => { await result.current.accept('order-1') })
    expect(result.current.isPending).toBe(false)
  })
})
