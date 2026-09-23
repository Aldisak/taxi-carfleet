import { describe, it, expect } from 'vitest'
import { groupByPragueDay, historyStatusTone } from './dayGrouping'
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

describe('groupByPragueDay', () => {
  it('returns no groups for an empty list', () => {
    expect(groupByPragueDay([])).toEqual([])
  })

  it('buckets rides sharing a Prague day into one group', () => {
    const a = row({ id: 'a', completedAt: '2026-09-10T08:20:00Z' })
    const b = row({ id: 'b', completedAt: '2026-09-10T15:00:00Z' })
    const groups = groupByPragueDay([a, b])

    expect(groups).toHaveLength(1)
    expect(groups[0].items.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('splits rides into separate groups per Prague day, preserving input order', () => {
    const newer = row({ id: 'newer', completedAt: '2026-09-11T08:00:00Z' })
    const older = row({ id: 'older', completedAt: '2026-09-10T08:00:00Z' })
    const groups = groupByPragueDay([newer, older])

    expect(groups.map((g) => g.items[0].id)).toEqual(['newer', 'older'])
  })

  it('buckets a late-UTC timestamp into the correct Prague day (CEST +2)', () => {
    // 22:30 UTC on Sep 10 is 00:30 on Sep 11 in Europe/Prague (CEST, +2h).
    const lateUtc = row({ id: 'late', completedAt: '2026-09-10T22:30:00Z' })
    const morning = row({ id: 'morning', completedAt: '2026-09-11T06:00:00Z' })
    const groups = groupByPragueDay([lateUtc, morning])

    // Both fall on Prague Sep 11 → one group.
    expect(groups).toHaveLength(1)
    expect(groups[0].items.map((r) => r.id)).toEqual(['late', 'morning'])
  })

  it('keys buckets off completedAt when present, else createdAt', () => {
    const noCompletion = row({ id: 'x', completedAt: null, createdAt: '2026-09-12T09:00:00Z' })
    const groups = groupByPragueDay([noCompletion])

    expect(groups).toHaveLength(1)
    expect(groups[0].items[0].id).toBe('x')
    // The label is a Prague-formatted date string (non-empty), not an i18n key.
    expect(groups[0].label).toMatch(/2026/)
  })
})

describe('historyStatusTone', () => {
  it('maps Completed to success', () => {
    expect(historyStatusTone('Completed')).toBe('success')
  })
  it('maps Cancelled to danger', () => {
    expect(historyStatusTone('Cancelled')).toBe('danger')
  })
  it('maps anything else to info', () => {
    expect(historyStatusTone('InProgress')).toBe('info')
  })
})
