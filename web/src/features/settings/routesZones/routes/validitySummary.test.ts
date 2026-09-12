import { describe, it, expect } from 'vitest'
import { buildValiditySummary, type ValidityInput } from './validitySummary'

// Czech day labels used by the summary (Po..Ne). The bitmask is 1=Mon … 64=Sun.
const DAY = {
  mon: 1,
  tue: 2,
  wed: 4,
  thu: 8,
  fri: 16,
  sat: 32,
  sun: 64,
} as const

const ALL_WEEK = DAY.mon | DAY.tue | DAY.wed | DAY.thu | DAY.fri | DAY.sat | DAY.sun // 127

function input(partial: Partial<ValidityInput>): ValidityInput {
  return { validDays: ALL_WEEK, validFromTime: null, validToTime: null, ...partial }
}

describe('buildValiditySummary', () => {
  it('renders all week + all day as "Po–Ne, celý den"', () => {
    expect(buildValiditySummary(input({}))).toBe('Po–Ne, celý den')
  })

  it('renders a bounded window (Fri–Sat 22:00–06:00) with a contiguous day range', () => {
    const s = buildValiditySummary(
      input({ validDays: DAY.fri | DAY.sat, validFromTime: '22:00:00', validToTime: '06:00:00' }),
    )
    expect(s).toBe('Pá–So 22:00–06:00')
  })

  it('keeps a midnight-wrapping window as entered (from > to)', () => {
    const s = buildValiditySummary(
      input({ validDays: ALL_WEEK, validFromTime: '22:00:00', validToTime: '06:00:00' }),
    )
    // The window still reads 22:00–06:00; wrap is a matching concern, not a display one.
    expect(s).toBe('Po–Ne 22:00–06:00')
  })

  it('renders a single day', () => {
    expect(buildValiditySummary(input({ validDays: DAY.wed }))).toBe('St, celý den')
  })

  it('renders non-contiguous days as a comma list (Po, St, Pá)', () => {
    expect(buildValiditySummary(input({ validDays: DAY.mon | DAY.wed | DAY.fri }))).toBe('Po, St, Pá, celý den')
  })

  it('trims HH:mm:ss to HH:mm and accepts HH:mm input', () => {
    expect(buildValiditySummary(input({ validFromTime: '03:00', validToTime: '04:30' }))).toBe('Po–Ne 03:00–04:30')
  })

  it('treats no valid days as "Nikdy"', () => {
    expect(buildValiditySummary(input({ validDays: 0 }))).toBe('Nikdy')
  })

  it('collapses a mix of ranges and singles (Po–St, Pá)', () => {
    const s = buildValiditySummary(input({ validDays: DAY.mon | DAY.tue | DAY.wed | DAY.fri }))
    expect(s).toBe('Po–St, Pá, celý den')
  })
})
