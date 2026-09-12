import { describe, it, expect, vi, beforeEach } from 'vitest'

// All mocks must be defined before imports
vi.mock('../../../shared/api/client', () => ({
  getDriverMe: vi.fn(),
  getOrder: vi.fn(),
}))

vi.mock('./idbRideStore', () => ({
  idbRideStore: {
    getActiveOrderId: vi.fn(),
    getArrivedAt: vi.fn(),
    setActiveOrderId: vi.fn(),
    clear: vi.fn(),
  },
}))

import { getDriverMe, getOrder } from '../../../shared/api/client'
import { idbRideStore } from './idbRideStore'
import { reconcileActiveRide } from './useRideRestore'

const mockGetDriverMe = vi.mocked(getDriverMe)
const mockGetOrder = vi.mocked(getOrder)
const mockIdb = vi.mocked(idbRideStore)

function makeMe(overrides: Partial<{ driverId: string; activeOrderId: string | null }> = {}) {
  return {
    driverId: 'driver-1',
    displayName: 'Jan Novák',
    status: 'Busy',
    currentVehicleId: 'v-1',
    currentVehiclePlate: 'ABC123',
    lastPositionAt: null,
    currentShiftId: null,
    currentShiftStartedAt: null,
    activeOrderId: 'order-1',
    ...overrides,
  }
}

function makeOrderDto(overrides: Partial<{
  id: string
  status: string
  driverId: string | null
}> = {}) {
  return {
    id: 'order-1',
    publicCode: 'ABC123',
    status: 'Accepted',
    source: 'Phone',
    customerPhone: '+420777000000',
    customerName: null,
    pickupAddress: 'Praha 1',
    pickupLat: 50.0,
    pickupLng: 14.4,
    dropoffAddress: null,
    dropoffLat: null,
    dropoffLng: null,
    scheduledAt: null,
    note: null,
    passengers: 1,
    priceType: 'Meter',
    estimatedPriceCzk: null,
    fixedPriceCzk: null,
    finalPriceCzk: null,
    paymentType: null,
    driverId: 'driver-1',
    vehicleId: null,
    createdAt: '2026-09-12T10:00:00.000Z',
    updatedAt: '2026-09-12T10:00:00.000Z',
    allowedActions: ['arrive'],
    version: 1,
    ...overrides,
  }
}

describe('reconcileActiveRide', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIdb.clear.mockResolvedValue(undefined)
    mockIdb.setActiveOrderId.mockResolvedValue(undefined)
    mockIdb.getArrivedAt.mockResolvedValue(null)
    mockIdb.getActiveOrderId.mockResolvedValue(null)
  })

  it('server is authoritative: activeOrderId set, order non-terminal → active, fetches order', async () => {
    mockIdb.getActiveOrderId.mockResolvedValue('order-1')
    mockGetDriverMe.mockResolvedValue(makeMe({ activeOrderId: 'order-1' }))
    const order = makeOrderDto({ id: 'order-1', status: 'Accepted' })
    mockGetOrder.mockResolvedValue(order)

    const result = await reconcileActiveRide('driver-1')

    expect(mockGetDriverMe).toHaveBeenCalled()
    expect(result.outcome).toBe('active')
    expect(result.order).toEqual(order)
  })

  it('AC#6 rebuild: IDB empty but server activeOrderId set → rebuilds from server (active)', async () => {
    mockIdb.getActiveOrderId.mockResolvedValue(null) // IDB empty
    mockGetDriverMe.mockResolvedValue(makeMe({ activeOrderId: 'order-1' }))
    const order = makeOrderDto({ id: 'order-1', status: 'Arrived' })
    mockGetOrder.mockResolvedValue(order)

    const result = await reconcileActiveRide('driver-1')

    expect(result.outcome).toBe('active')
    expect(result.order).toEqual(order)
    // rebuilt ID persisted to IDB for next time
    expect(mockIdb.setActiveOrderId).toHaveBeenCalledWith('order-1')
  })

  it('terminal: server activeOrderId set but order is Completed → clear + terminal', async () => {
    mockIdb.getActiveOrderId.mockResolvedValue('order-1')
    mockGetDriverMe.mockResolvedValue(makeMe({ activeOrderId: 'order-1' }))
    const order = makeOrderDto({ id: 'order-1', status: 'Completed' })
    mockGetOrder.mockResolvedValue(order)

    const result = await reconcileActiveRide('driver-1')

    expect(result.outcome).toBe('terminal')
    expect(mockIdb.clear).toHaveBeenCalled()
  })

  it('none: server activeOrderId null → clear stale IDB + none (no getOrder)', async () => {
    mockIdb.getActiveOrderId.mockResolvedValue('order-1') // stale local
    mockGetDriverMe.mockResolvedValue(makeMe({ activeOrderId: null }))

    const result = await reconcileActiveRide('driver-1')

    expect(result.outcome).toBe('none')
    expect(mockGetOrder).not.toHaveBeenCalled()
    expect(mockIdb.clear).toHaveBeenCalled()
  })

  it('active restores arrivedAt from IDB when the local id matches the server active id', async () => {
    mockIdb.getActiveOrderId.mockResolvedValue('order-1')
    mockIdb.getArrivedAt.mockResolvedValue('2026-09-12T10:00:00.000Z')
    mockGetDriverMe.mockResolvedValue(makeMe({ activeOrderId: 'order-1' }))
    const order = makeOrderDto({ id: 'order-1', status: 'Arrived' })
    mockGetOrder.mockResolvedValue(order)

    const result = await reconcileActiveRide('driver-1')

    expect(result.outcome).toBe('active')
    expect(result.arrivedAt).toBe('2026-09-12T10:00:00.000Z')
  })

  it('active does NOT carry arrivedAt from IDB when local id differs from server active id', async () => {
    mockIdb.getActiveOrderId.mockResolvedValue('order-OLD')
    mockIdb.getArrivedAt.mockResolvedValue('2026-09-12T09:00:00.000Z')
    mockGetDriverMe.mockResolvedValue(makeMe({ activeOrderId: 'order-1' }))
    const order = makeOrderDto({ id: 'order-1', status: 'Arrived' })
    mockGetOrder.mockResolvedValue(order)

    const result = await reconcileActiveRide('driver-1')

    expect(result.outcome).toBe('active')
    expect(result.arrivedAt).toBeNull()
  })
})
