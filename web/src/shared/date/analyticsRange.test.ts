import { describe, it, expect } from 'vitest'
import {
  defaultThisMonthRange,
  presetRanges,
  previousPeriodOf,
  type DateRange,
  type RangePreset,
} from './analyticsRange'

// 2026-09-13 12:00 UTC → Prague 14:00 (CEST +2), same calendar day: 2026-09-13
const SEPT_13_UTC = new Date('2026-09-13T12:00:00Z')
// 2026-01-01 12:00 UTC → Prague 13:00 (CET +1), day = 2026-01-01
const JAN_1_UTC = new Date('2026-01-01T12:00:00Z')
// 2026-03-29 01:30 UTC → Prague 03:30 (CEST starts this night), day = 2026-03-29
const DST_SPRING_UTC = new Date('2026-03-29T01:30:00Z')

describe('defaultThisMonthRange', () => {
  it('returns from=first of Prague month to Prague today', () => {
    const r = defaultThisMonthRange(SEPT_13_UTC)
    expect(r.from).toBe('2026-09-01')
    expect(r.to).toBe('2026-09-13')
  })

  it('crosses UTC midnight correctly at month boundary', () => {
    // 2026-09-30 23:30 UTC → 2026-10-01 01:30 Prague (CEST +2) → October
    const r = defaultThisMonthRange(new Date('2026-09-30T23:30:00Z'))
    expect(r.from).toBe('2026-10-01')
    expect(r.to).toBe('2026-10-01')
  })
})

describe('presetRanges', () => {
  it('dnes returns today (Prague) as both from and to', () => {
    const p = presetRanges(SEPT_13_UTC)
    expect(p.dnes.from).toBe('2026-09-13')
    expect(p.dnes.to).toBe('2026-09-13')
  })

  it('7dni returns last 7 Prague days ending today', () => {
    const p = presetRanges(SEPT_13_UTC)
    expect(p['7dni'].from).toBe('2026-09-07')
    expect(p['7dni'].to).toBe('2026-09-13')
  })

  it('tentoMesic returns first of month through today', () => {
    const p = presetRanges(SEPT_13_UTC)
    expect(p.tentoMesic.from).toBe('2026-09-01')
    expect(p.tentoMesic.to).toBe('2026-09-13')
  })

  it('minulyMesic returns full previous calendar month', () => {
    const p = presetRanges(SEPT_13_UTC)
    expect(p.minulyMesic.from).toBe('2026-08-01')
    expect(p.minulyMesic.to).toBe('2026-08-31')
  })

  it('kvartal returns first of the current Prague quarter through today', () => {
    // Sep 13 is Q3 (July–September): starts 2026-07-01
    const p = presetRanges(SEPT_13_UTC)
    expect(p.kvartal.from).toBe('2026-07-01')
    expect(p.kvartal.to).toBe('2026-09-13')
  })

  it('rok returns 1st Jan of Prague year through today', () => {
    const p = presetRanges(SEPT_13_UTC)
    expect(p.rok.from).toBe('2026-01-01')
    expect(p.rok.to).toBe('2026-09-13')
  })

  it('vlastni is undefined by default (user-defined)', () => {
    const p = presetRanges(SEPT_13_UTC)
    expect(p.vlastni).toBeUndefined()
  })

  it('Q1 quarter starts on Jan 1', () => {
    const p = presetRanges(JAN_1_UTC)
    expect(p.kvartal.from).toBe('2026-01-01')
  })

  it('DST spring transition does not break the 7dni preset', () => {
    // 2026-03-29 01:30 UTC → Prague 03:30 (CEST), calendar day = 2026-03-29
    // 7dni from: 2026-03-23
    const p = presetRanges(DST_SPRING_UTC)
    expect(p['7dni'].from).toBe('2026-03-23')
    expect(p['7dni'].to).toBe('2026-03-29')
  })
})

describe('previousPeriodOf', () => {
  it('returns the immediately preceding period of equal length', () => {
    // 2026-09-01..2026-09-13 = 13 days; prev = 2026-08-19..2026-08-31
    const range: DateRange = { from: '2026-09-01', to: '2026-09-13' }
    const prev = previousPeriodOf(range)
    expect(prev.from).toBe('2026-08-19')
    expect(prev.to).toBe('2026-08-31')
  })

  it('single-day range goes back one day', () => {
    const range: DateRange = { from: '2026-09-13', to: '2026-09-13' }
    const prev = previousPeriodOf(range)
    expect(prev.from).toBe('2026-09-12')
    expect(prev.to).toBe('2026-09-12')
  })

  it('full month range gives the preceding full month (28-day Feb)', () => {
    // January 2026 has 31 days; prev = 2025-12-01..2025-12-31 (31 days)
    const range: DateRange = { from: '2026-01-01', to: '2026-01-31' }
    const prev = previousPeriodOf(range)
    expect(prev.from).toBe('2025-12-01')
    expect(prev.to).toBe('2025-12-31')
  })

  it('preserved-length over a year boundary', () => {
    // 2025-12-25..2025-12-31 = 7 days; prev = 2025-12-18..2025-12-24
    const range: DateRange = { from: '2025-12-25', to: '2025-12-31' }
    const prev = previousPeriodOf(range)
    expect(prev.from).toBe('2025-12-18')
    expect(prev.to).toBe('2025-12-24')
  })
})

describe('RangePreset type', () => {
  it('all preset keys are typed', () => {
    // Just a type-level compile test; runtime does nothing.
    const _k: RangePreset = 'dnes'
    const _k2: RangePreset = '7dni'
    const _k3: RangePreset = 'tentoMesic'
    const _k4: RangePreset = 'minulyMesic'
    const _k5: RangePreset = 'kvartal'
    const _k6: RangePreset = 'rok'
    const _k7: RangePreset = 'vlastni'
    expect(_k).toBe('dnes')
    expect(_k2).toBe('7dni')
    expect(_k3).toBe('tentoMesic')
    expect(_k4).toBe('minulyMesic')
    expect(_k5).toBe('kvartal')
    expect(_k6).toBe('rok')
    expect(_k7).toBe('vlastni')
  })
})
