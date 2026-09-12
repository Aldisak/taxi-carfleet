import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

vi.mock('../../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/client')>(
    '../../../shared/api/client',
  )
  return { ...actual, getMyActiveOrder: vi.fn(), getOrder: vi.fn(), getOrderByCode: vi.fn() }
})

// useFleetHub (singleton SignalR) is a no-op in unit tests; invokeHub is spied.
const invokeHub = vi.fn().mockResolvedValue(true)
vi.mock('../../../shared/realtime/useFleetHub', () => ({
  useFleetHub: vi.fn(),
  useHubConnectionState: () => 'connected',
  invokeHub: (...args: unknown[]) => invokeHub(...args),
}))

import { getMyActiveOrder, getOrder, getOrderByCode } from '../../../shared/api/client'
import type { MyActiveOrderDto, OrderDetailDto, TrackDto } from '../../../shared/api/client'
import { useFleetHub } from '../../../shared/realtime/useFleetHub'
import { useTrackingAuthed } from './useTrackingAuthed'

const mockActive = vi.mocked(getMyActiveOrder)
const mockOrder = vi.mocked(getOrder)
const mockByCode = vi.mocked(getOrderByCode)
const mockUseFleetHub = vi.mocked(useFleetHub)

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

const active: MyActiveOrderDto = { id: 'order-1', publicCode: 'ABC123', status: 'Accepted' }

const detail = {
  id: 'order-1',
  publicCode: 'ABC123',
  status: 'Accepted',
  driverId: 'driver-9',
  finalPriceCzk: null,
  fixedPriceCzk: 150,
  estimatedPriceCzk: null,
  dropoffAddress: 'Náměstí 1',
} as unknown as OrderDetailDto

const byCode: TrackDto = {
  publicCode: 'ABC123',
  status: 'Accepted',
  pickupAddress: 'Hlavní 1',
  dropoffAddress: 'Náměstí 1',
  scheduledAt: null,
  driverFirstName: 'Petr',
  vehiclePlate: '1AB 2345',
  vehicleColor: 'černá',
  position: { lat: 50.0, lng: 14.4 },
  etaMinutes: null,
  displayPriceCzk: 150,
}

describe('useTrackingAuthed', () => {
  beforeEach(() => {
    mockActive.mockReset()
    mockOrder.mockReset()
    mockByCode.mockReset()
    invokeHub.mockClear()
    mockUseFleetHub.mockClear()
  })

  it('enables the hub only for a non-empty code (authed), not for public/none mode', async () => {
    mockActive.mockResolvedValue(null)
    mockByCode.mockResolvedValue(byCode)

    // Non-empty code => authed mode => hub enabled.
    const authed = renderHook(() => useTrackingAuthed('ABC123'), { wrapper: makeWrapper() })
    await waitFor(() => expect(mockUseFleetHub).toHaveBeenCalledWith(true))
    authed.unmount()

    mockUseFleetHub.mockClear()

    // Empty code => public/none mode => hub NOT enabled (no doomed authed connect loop).
    renderHook(() => useTrackingAuthed(''), { wrapper: makeWrapper() })
    await waitFor(() => expect(mockUseFleetHub).toHaveBeenCalledWith(false))
  })

  it('resolves the order id via getMyActiveOrder and exposes it + the detail', async () => {
    mockActive.mockResolvedValue(active)
    mockOrder.mockResolvedValue(detail)
    mockByCode.mockResolvedValue(byCode)

    const { result } = renderHook(() => useTrackingAuthed('ABC123'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.orderId).toBe('order-1'))
    expect(result.current.vm.status).toBe('Accepted')
    expect(result.current.vm.driverFirstName).toBe('Petr')
    // Price comes from the full order detail (fixedPriceCzk) since finalPriceCzk is null.
    expect(result.current.vm.priceCzk).toBe(150)
  })

  it('calls Subscribe(orderId) once the id is known and the hub is connected', async () => {
    mockActive.mockResolvedValue(active)
    mockOrder.mockResolvedValue(detail)
    mockByCode.mockResolvedValue(byCode)

    renderHook(() => useTrackingAuthed('ABC123'), { wrapper: makeWrapper() })

    await waitFor(() => expect(invokeHub).toHaveBeenCalledWith('Subscribe', 'order-1'))
  })

  it('still shows the by-code VM when there is no active order (terminal/cold load)', async () => {
    // getMyActiveOrder returns null for a Completed/Cancelled order — no id, no live detail.
    mockActive.mockResolvedValue(null)
    mockByCode.mockResolvedValue({ ...byCode, status: 'Completed' })

    const { result } = renderHook(() => useTrackingAuthed('ABC123'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.vm.status).toBe('Completed'))
    expect(result.current.orderId).toBeNull()
    expect(invokeHub).not.toHaveBeenCalled()
    // Price falls back to the by-code displayPriceCzk when there is no full detail.
    expect(result.current.vm.priceCzk).toBe(150)
  })
})
