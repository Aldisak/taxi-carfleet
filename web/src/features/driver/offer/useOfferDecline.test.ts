import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { ApiResponseError } from '../../../shared/api/client'

vi.mock('../../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/client')>('../../../shared/api/client')
  return {
    ...actual,
    postDeclineOrder: vi.fn(),
  }
})

import { postDeclineOrder } from '../../../shared/api/client'
import { useOfferDecline } from './useOfferDecline'

const mockPostDeclineOrder = vi.mocked(postDeclineOrder)

describe('useOfferDecline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns noReason when reason is empty — no network call', async () => {
    const { result } = renderHook(() => useOfferDecline())

    let outcome
    await act(async () => {
      outcome = await result.current.decline('order-1', '')
    })
    expect(outcome).toEqual({ type: 'noReason' })
    expect(mockPostDeclineOrder).not.toHaveBeenCalled()
  })

  it('returns noReason when reason is whitespace — no network call', async () => {
    const { result } = renderHook(() => useOfferDecline())

    let outcome
    await act(async () => {
      outcome = await result.current.decline('order-1', '   ')
    })
    expect(outcome).toEqual({ type: 'noReason' })
    expect(mockPostDeclineOrder).not.toHaveBeenCalled()
  })

  it('returns success on 204', async () => {
    mockPostDeclineOrder.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useOfferDecline())

    let outcome
    await act(async () => {
      outcome = await result.current.decline('order-1', 'Daleko')
    })
    expect(outcome).toEqual({ type: 'success' })
  })

  it('returns stale on 404 (F-08)', async () => {
    const err = new ApiResponseError(404, { status: 404, title: 'Not Found', type: '' })
    mockPostDeclineOrder.mockRejectedValueOnce(err)
    const { result } = renderHook(() => useOfferDecline())

    let outcome
    await act(async () => {
      outcome = await result.current.decline('order-1', 'Daleko')
    })
    expect(outcome).toEqual({ type: 'stale' })
  })

  it('returns stale on 409 (F-08)', async () => {
    const err = new ApiResponseError(409, { status: 409, title: 'Conflict', type: '' })
    mockPostDeclineOrder.mockRejectedValueOnce(err)
    const { result } = renderHook(() => useOfferDecline())

    let outcome
    await act(async () => {
      outcome = await result.current.decline('order-1', 'Daleko')
    })
    expect(outcome).toEqual({ type: 'stale' })
  })

  it('returns offline on network error (TypeError)', async () => {
    mockPostDeclineOrder.mockRejectedValueOnce(new TypeError('Network error'))
    const { result } = renderHook(() => useOfferDecline())

    let outcome
    await act(async () => {
      outcome = await result.current.decline('order-1', 'Daleko')
    })
    expect(outcome).toEqual({ type: 'offline' })
  })
})
