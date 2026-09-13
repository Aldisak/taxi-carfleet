import { describe, it, expect } from 'vitest'
import { defaultThisMonthRange } from './reportDateRange'

describe('defaultThisMonthRange', () => {
  it('spans the first of the Prague month through today', () => {
    // 2026-09-13 12:00 UTC → Prague 14:00, same calendar day.
    const range = defaultThisMonthRange(new Date('2026-09-13T12:00:00Z'))
    expect(range.from).toBe('2026-09-01')
    expect(range.to).toBe('2026-09-13')
  })

  it('uses the Prague calendar day near the UTC midnight boundary', () => {
    // 2026-09-30 23:30 UTC is 2026-10-01 01:30 in Prague (CEST +2) → October.
    const range = defaultThisMonthRange(new Date('2026-09-30T23:30:00Z'))
    expect(range.from).toBe('2026-10-01')
    expect(range.to).toBe('2026-10-01')
  })
})
