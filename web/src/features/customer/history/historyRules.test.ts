import { describe, it, expect } from 'vitest'
import { isHistoryEmpty, historyRowPriceCzk, historyStatusKey, historyRowTimestamp } from './historyRules'
import type { MyOrderHistoryItemDto } from '../../../shared/api/client'

function row(over: Partial<MyOrderHistoryItemDto> = {}): MyOrderHistoryItemDto {
  return {
    id: 'o1',
    publicCode: 'ABC123',
    status: 'Completed',
    pickupAddress: 'Hlavní 1',
    dropoffAddress: 'Náměstí 5',
    priceType: 'Fixed',
    fixedPriceCzk: 150,
    finalPriceCzk: null,
    ratingStars: null,
    createdAt: '2026-09-10T08:00:00Z',
    completedAt: '2026-09-10T08:20:00Z',
    ...over,
  }
}

describe('isHistoryEmpty', () => {
  it('is true for no rows', () => {
    expect(isHistoryEmpty([])).toBe(true)
  })
  it('is false when rows exist', () => {
    expect(isHistoryEmpty([row()])).toBe(false)
  })
})

describe('historyRowPriceCzk', () => {
  it('prefers the final price', () => {
    expect(historyRowPriceCzk({ finalPriceCzk: 200, fixedPriceCzk: 150 })).toBe(200)
  })
  it('falls back to the fixed price', () => {
    expect(historyRowPriceCzk({ finalPriceCzk: null, fixedPriceCzk: 150 })).toBe(150)
  })
  it('is null when neither is set', () => {
    expect(historyRowPriceCzk({ finalPriceCzk: null, fixedPriceCzk: null })).toBeNull()
  })
})

describe('historyStatusKey', () => {
  it('maps Completed and Cancelled', () => {
    expect(historyStatusKey('Completed')).toBe('customer.history.statusCompleted')
    expect(historyStatusKey('Cancelled')).toBe('customer.history.statusCancelled')
  })
  it('maps anything else to active', () => {
    expect(historyStatusKey('InProgress')).toBe('customer.history.statusActive')
  })
})

describe('historyRowTimestamp', () => {
  it('uses completedAt when present', () => {
    expect(historyRowTimestamp({ completedAt: '2026-09-10T08:20:00Z', createdAt: '2026-09-10T08:00:00Z' })).toBe(
      '2026-09-10T08:20:00Z',
    )
  })
  it('falls back to createdAt', () => {
    expect(historyRowTimestamp({ completedAt: null, createdAt: '2026-09-10T08:00:00Z' })).toBe('2026-09-10T08:00:00Z')
  })
})
