import { describe, it, expect } from 'vitest'
import { sortDriversForColumn } from './driverColumnSort'
import type { DriverSummaryDto } from '../../shared/api/client'

function makeDriver(overrides: Partial<DriverSummaryDto> & { driverId: string }): DriverSummaryDto {
  return {
    driverId: overrides.driverId,
    displayName: overrides.displayName ?? overrides.driverId,
    status: overrides.status ?? 'Offline',
    currentVehiclePlate: overrides.currentVehiclePlate ?? null,
    lastPositionAt: overrides.lastPositionAt ?? null,
    lastLat: overrides.lastLat ?? null,
    lastLng: overrides.lastLng ?? null,
  }
}

describe('sortDriversForColumn', () => {
  it('Free before Busy', () => {
    const drivers = [
      makeDriver({ driverId: 'b', status: 'Busy' }),
      makeDriver({ driverId: 'a', status: 'Free' }),
    ]
    const sorted = sortDriversForColumn(drivers)
    expect(sorted[0].driverId).toBe('a')
    expect(sorted[1].driverId).toBe('b')
  })

  it('Free before EnRoute', () => {
    const drivers = [
      makeDriver({ driverId: 'c', status: 'EnRoute' }),
      makeDriver({ driverId: 'a', status: 'Free' }),
    ]
    const sorted = sortDriversForColumn(drivers)
    expect(sorted[0].driverId).toBe('a')
  })

  it('EnRoute before Offline', () => {
    const drivers = [
      makeDriver({ driverId: 'z', status: 'Offline' }),
      makeDriver({ driverId: 'e', status: 'EnRoute' }),
    ]
    const sorted = sortDriversForColumn(drivers)
    expect(sorted[0].driverId).toBe('e')
    expect(sorted[1].driverId).toBe('z')
  })

  it('Busy before Offline', () => {
    const drivers = [
      makeDriver({ driverId: 'z', status: 'Offline' }),
      makeDriver({ driverId: 'b', status: 'Busy' }),
    ]
    const sorted = sortDriversForColumn(drivers)
    expect(sorted[0].driverId).toBe('b')
  })

  it('sorts alpha within the same status group', () => {
    const drivers = [
      makeDriver({ driverId: 'f2', displayName: 'Zuzana', status: 'Free' }),
      makeDriver({ driverId: 'f1', displayName: 'Adam', status: 'Free' }),
    ]
    const sorted = sortDriversForColumn(drivers)
    expect(sorted[0].displayName).toBe('Adam')
    expect(sorted[1].displayName).toBe('Zuzana')
  })

  it('full order: Free, EnRoute, Busy, Offline, alpha within each', () => {
    const drivers = [
      makeDriver({ driverId: 'o2', displayName: 'Zdenka', status: 'Offline' }),
      makeDriver({ driverId: 'b1', displayName: 'Karel', status: 'Busy' }),
      makeDriver({ driverId: 'f1', displayName: 'Adam', status: 'Free' }),
      makeDriver({ driverId: 'e1', displayName: 'Lucie', status: 'EnRoute' }),
      makeDriver({ driverId: 'o1', displayName: 'Alena', status: 'Offline' }),
    ]
    const sorted = sortDriversForColumn(drivers)
    // EnRoute and Busy share group 1; within group1 sorted alphabetically: Karel < Lucie
    expect(sorted.map(d => d.displayName)).toEqual(['Adam', 'Karel', 'Lucie', 'Alena', 'Zdenka'])
  })
})
