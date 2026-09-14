/**
 * Unit tests for leagueSort.ts — pure driver league table sort logic.
 */

import { describe, it, expect } from 'vitest'
import type { DriverLeagueRowDto } from '../../../shared/api/client'
import { sortLeague } from './leagueSort'

const makeRow = (overrides: Partial<DriverLeagueRowDto> = {}): DriverLeagueRowDto => ({
  driverId: 'driver-1',
  name: 'Jan Novák',
  ridesCompleted: 10,
  revenueCzk: 5000,
  onlineHours: 8,
  utilizationPct: 0.75,
  revenuePerOnlineHour: 625,
  acceptanceRate: 0.9,
  avgTimeToAcceptSeconds: 30,
  declinesAndTimeouts: 1,
  cancellations: 0,
  noShows: 0,
  avgRating: 4.5,
  ...overrides,
})

const rowA = makeRow({ driverId: 'a', name: 'Adam', ridesCompleted: 20, revenueCzk: 10000, avgRating: 4.8 })
const rowB = makeRow({ driverId: 'b', name: 'Bořek', ridesCompleted: 15, revenueCzk: 7000, avgRating: 4.2 })
const rowC = makeRow({ driverId: 'c', name: 'Cyril', ridesCompleted: 5, revenueCzk: 2000, avgRating: null })

describe('sortLeague', () => {
  it('sorts by ridesCompleted descending by default', () => {
    const result = sortLeague([rowB, rowC, rowA], 'ridesCompleted', 'desc')
    expect(result.map(r => r.driverId)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by ridesCompleted ascending', () => {
    const result = sortLeague([rowA, rowB, rowC], 'ridesCompleted', 'asc')
    expect(result.map(r => r.driverId)).toEqual(['c', 'b', 'a'])
  })

  it('sorts by revenueCzk descending', () => {
    const result = sortLeague([rowB, rowC, rowA], 'revenueCzk', 'desc')
    expect(result.map(r => r.driverId)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by name ascending (alphabetical)', () => {
    const result = sortLeague([rowB, rowA, rowC], 'name', 'asc')
    expect(result.map(r => r.name)).toEqual(['Adam', 'Bořek', 'Cyril'])
  })

  it('places null avgRating last when sorting by avgRating descending', () => {
    const result = sortLeague([rowC, rowA, rowB], 'avgRating', 'desc')
    expect(result.map(r => r.driverId)).toEqual(['a', 'b', 'c'])
  })

  it('places null avgRating last when sorting by avgRating ascending', () => {
    const result = sortLeague([rowC, rowA, rowB], 'avgRating', 'asc')
    // null is last even in ascending; a=4.8, b=4.2, c=null → b, a, c
    expect(result.map(r => r.driverId)).toEqual(['b', 'a', 'c'])
  })

  it('does not mutate the input array', () => {
    const rows = [rowA, rowB, rowC]
    sortLeague(rows, 'ridesCompleted', 'desc')
    expect(rows[0]).toBe(rowA)
  })

  it('returns empty array for empty input', () => {
    expect(sortLeague([], 'ridesCompleted', 'desc')).toEqual([])
  })
})
