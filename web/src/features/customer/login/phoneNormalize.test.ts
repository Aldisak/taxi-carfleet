import { describe, it, expect } from 'vitest'
import { normalizeCzechPhone, isValidCode } from './phoneNormalize'

describe('normalizeCzechPhone', () => {
  it('prefixes a bare 9-digit Czech number with +420', () => {
    expect(normalizeCzechPhone('123456789')).toBe('+420123456789')
  })

  it('strips spaces and grouping from a 9-digit number', () => {
    expect(normalizeCzechPhone('123 456 789')).toBe('+420123456789')
  })

  it('keeps an already-normalized +420 number', () => {
    expect(normalizeCzechPhone('+420123456789')).toBe('+420123456789')
  })

  it('normalizes a 00420 international prefix to +420', () => {
    expect(normalizeCzechPhone('00420123456789')).toBe('+420123456789')
  })

  it('accepts a different E.164 country code as-is', () => {
    expect(normalizeCzechPhone('+421905123456')).toBe('+421905123456')
  })

  it('returns null for too-few digits', () => {
    expect(normalizeCzechPhone('12345')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(normalizeCzechPhone('   ')).toBeNull()
  })

  it('returns null for non-numeric junk', () => {
    expect(normalizeCzechPhone('abcdefghi')).toBeNull()
  })
})

describe('isValidCode', () => {
  it('accepts exactly 6 digits', () => {
    expect(isValidCode('123456')).toBe(true)
  })

  it('rejects fewer than 6 digits', () => {
    expect(isValidCode('12345')).toBe(false)
  })

  it('rejects more than 6 digits', () => {
    expect(isValidCode('1234567')).toBe(false)
  })

  it('rejects non-digits', () => {
    expect(isValidCode('12345a')).toBe(false)
  })
})
