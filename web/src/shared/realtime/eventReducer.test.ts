import { describe, it, expect } from 'vitest'
import {
  applyOrderChanged,
  applyDriverStatusChanged,
  decideSound,
  shouldIgnoreOrderChanged,
} from './eventReducer'
import type { OrderChangedPayload, DriverStatusChangedPayload, CachedOrderVersion } from './eventReducer'
import type { OrderSummaryDto } from '../api/client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOrderSummary(overrides: Partial<OrderSummaryDto> = {}): OrderSummaryDto {
  return {
    id: 'order-1',
    publicCode: 'T-001',
    status: 'New',
    source: 'Dispatcher',
    customerPhone: '+420123456789',
    customerName: null,
    pickupAddress: 'Pickup',
    dropoffAddress: null,
    scheduledAt: null,
    passengers: 1,
    priceType: 'Meter',
    estimatedPriceCzk: null,
    fixedPriceCzk: null,
    driverId: null,
    createdAt: '2024-01-01T10:00:00Z',
    ...overrides,
  }
}

// makeOrderChanged mirrors C# OrderChangedDto field-for-field (9 fields):
// id, fleetId, publicCode, status, driverId, customerUserId, updatedAt, version, source
function makeOrderChanged(overrides: Partial<OrderChangedPayload> = {}): OrderChangedPayload {
  return {
    id: 'order-1',
    fleetId: 'fleet-1',
    publicCode: 'T-001',
    status: 'New',
    driverId: null,
    customerUserId: null,
    updatedAt: '2024-01-01T10:01:00Z',
    version: 2,
    source: 'Dispatcher',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// shouldIgnoreOrderChanged
// ---------------------------------------------------------------------------

describe('shouldIgnoreOrderChanged — stale version check', () => {
  it('should NOT ignore when no cached version exists', () => {
    const versions: Map<string, CachedOrderVersion> = new Map()
    expect(shouldIgnoreOrderChanged(makeOrderChanged({ version: 1 }), versions)).toBe(false)
  })

  it('should NOT ignore when incoming version > cached version', () => {
    const versions = new Map<string, CachedOrderVersion>([['order-1', { version: 1 }]])
    expect(shouldIgnoreOrderChanged(makeOrderChanged({ version: 2 }), versions)).toBe(false)
  })

  it('should NOT ignore when incoming version === cached version (same = idempotent apply)', () => {
    const versions = new Map<string, CachedOrderVersion>([['order-1', { version: 2 }]])
    expect(shouldIgnoreOrderChanged(makeOrderChanged({ version: 2 }), versions)).toBe(false)
  })

  it('should ignore when incoming version < cached version', () => {
    const versions = new Map<string, CachedOrderVersion>([['order-1', { version: 5 }]])
    expect(shouldIgnoreOrderChanged(makeOrderChanged({ version: 3 }), versions)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// applyOrderChanged
// ---------------------------------------------------------------------------

describe('applyOrderChanged', () => {
  it('updates an existing order in the list', () => {
    const existing: OrderSummaryDto[] = [
      makeOrderSummary({ id: 'order-1', status: 'New' }),
      makeOrderSummary({ id: 'order-2', status: 'Assigned' }),
    ]
    const event = makeOrderChanged({ id: 'order-1', status: 'Assigned', driverId: 'driver-abc' })
    const result = applyOrderChanged(existing, event)
    expect(result.find(o => o.id === 'order-1')?.status).toBe('Assigned')
    expect(result.find(o => o.id === 'order-1')?.driverId).toBe('driver-abc')
    expect(result.length).toBe(2) // no duplicates
  })

  it('does NOT insert a new order when id is not in the list (caller must invalidate instead)', () => {
    // F5: applyOrderChanged must never poison filtered caches with stub entries.
    // When the order is absent, return the list unchanged; useFleetHub invalidates that query.
    const existing: OrderSummaryDto[] = [makeOrderSummary({ id: 'order-1' })]
    const event = makeOrderChanged({ id: 'order-new', status: 'New', driverId: null })
    const result = applyOrderChanged(existing, event)
    expect(result.length).toBe(1)  // unchanged — no stub inserted
    expect(result.find(o => o.id === 'order-new')).toBeUndefined()
  })

  it('preserves fields not in the event payload (e.g. customerPhone)', () => {
    const existing: OrderSummaryDto[] = [
      makeOrderSummary({ id: 'order-1', customerPhone: '+420777888999' }),
    ]
    const event = makeOrderChanged({ id: 'order-1', status: 'Assigned' })
    const result = applyOrderChanged(existing, event)
    expect(result.find(o => o.id === 'order-1')?.customerPhone).toBe('+420777888999')
  })

  it('normalizes numeric status to string when applying to cache (status 1 → Assigned)', () => {
    // Tests that applyOrderChanged normalizes numeric enum status before patching cache
    const event = makeOrderChanged({ id: 'order-1', status: 1 })  // numeric 1 = Assigned
    const items: OrderSummaryDto[] = [makeOrderSummary({ id: 'order-1', status: 'New' })]
    const result = applyOrderChanged(items, event)
    // Status should be 'Assigned' (string), not '1'
    expect(result.find(o => o.id === 'order-1')?.status).toBe('Assigned')
  })
})

// ---------------------------------------------------------------------------
// applyDriverStatusChanged
// ---------------------------------------------------------------------------

describe('applyDriverStatusChanged', () => {
  it('updates driver status string in the items array', () => {
    const drivers = [
      { driverId: 'driver-1', status: 'Free' as const, displayName: 'Adam', currentVehiclePlate: null, lastPositionAt: null, lastLat: null, lastLng: null },
      { driverId: 'driver-2', status: 'Offline' as const, displayName: 'Bára', currentVehiclePlate: null, lastPositionAt: null, lastLat: null, lastLng: null },
    ]
    const event: DriverStatusChangedPayload = { driverId: 'driver-1', status: 'Busy' }
    const result = applyDriverStatusChanged(drivers, event)
    expect(result.find(d => d.driverId === 'driver-1')?.status).toBe('Busy')
    expect(result.find(d => d.driverId === 'driver-2')?.status).toBe('Offline')
  })

  it('returns array unchanged when driverId not found', () => {
    const drivers = [
      { driverId: 'driver-1', status: 'Free' as const, displayName: 'Adam', currentVehiclePlate: null, lastPositionAt: null, lastLat: null, lastLng: null },
    ]
    const event: DriverStatusChangedPayload = { driverId: 'unknown', status: 'Offline' }
    const result = applyDriverStatusChanged(drivers, event)
    expect(result).toEqual(drivers)
  })

  it('normalizes numeric driver status 3 to Busy', () => {
    const drivers = [
      { driverId: 'driver-1', status: 'Free' as const, displayName: 'Adam', currentVehiclePlate: null, lastPositionAt: null, lastLat: null, lastLng: null },
    ]
    const event: DriverStatusChangedPayload = { driverId: 'driver-1', status: 3 }  // numeric 3 = Busy
    const result = applyDriverStatusChanged(drivers, event)
    expect(result.find(d => d.driverId === 'driver-1')?.status).toBe('Busy')
  })
})

// ---------------------------------------------------------------------------
// decideSound
// ---------------------------------------------------------------------------

describe('decideSound', () => {
  it('plays new-order sound when fresh App order arrives (no prior cached entry)', () => {
    const event = makeOrderChanged({ id: 'order-new', status: 'New', source: 'App' })
    const versions = new Map<string, CachedOrderVersion>()
    expect(decideSound(event, versions)).toBe('new-order')
  })

  it('plays new-order sound when App order inserted first time with status New', () => {
    const event = makeOrderChanged({ id: 'order-fresh', status: 'New', source: 'App' })
    const versions = new Map<string, CachedOrderVersion>()
    expect(decideSound(event, versions)).toBe('new-order')
  })

  it('does NOT play new-order sound for Dispatcher source', () => {
    const event = makeOrderChanged({ id: 'order-1', status: 'New', source: 'Dispatcher' })
    const versions = new Map<string, CachedOrderVersion>()
    expect(decideSound(event, versions)).toBeNull()
  })

  it('plays decline/timeout sound when Assigned order transitions to New (driver declined)', () => {
    // Cached as Assigned, now incoming New = decline/timeout
    const event = makeOrderChanged({ id: 'order-1', status: 'New' })
    const versions = new Map<string, CachedOrderVersion>([
      ['order-1', { version: 1, lastStatus: 'Assigned' }],
    ])
    expect(decideSound(event, versions)).toBe('decline')
  })

  it('does NOT play sound for normal status transitions (Assigned -> InProgress)', () => {
    const event = makeOrderChanged({ id: 'order-1', status: 'InProgress' })
    const versions = new Map<string, CachedOrderVersion>([
      ['order-1', { version: 1, lastStatus: 'Assigned' }],
    ])
    expect(decideSound(event, versions)).toBeNull()
  })

  it('does NOT play new-order sound if App order already known (version exists)', () => {
    const event = makeOrderChanged({ id: 'order-1', status: 'New', source: 'App', version: 3 })
    const versions = new Map<string, CachedOrderVersion>([
      ['order-1', { version: 2, lastStatus: 'New' }],
    ])
    expect(decideSound(event, versions)).toBeNull()
  })

  it('plays decline sound when numeric status 0 (New) arrives after lastStatus Assigned', () => {
    // Simulates the hub sending numeric enum — 0=New, 1=Assigned
    const event = makeOrderChanged({ id: 'order-1', status: 0 })  // numeric 0 = New
    const versions = new Map<string, CachedOrderVersion>([
      ['order-1', { version: 1, lastStatus: 'Assigned' }],
    ])
    expect(decideSound(event, versions)).toBe('decline')
  })
})
