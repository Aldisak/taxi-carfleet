import { describe, it, expect } from 'vitest'
import { formatCzk } from './money'

describe('formatCzk', () => {
  it('formats an integer CZK amount with a Kč suffix', () => {
    expect(formatCzk(110)).toBe('110 Kč')
  })

  it('groups thousands in cs-CZ style', () => {
    // cs-CZ groups with a non-breaking space; assert via normalized whitespace.
    expect(formatCzk(1200).replace(/\s/g, ' ')).toBe('1 200 Kč')
  })

  it('formats zero', () => {
    expect(formatCzk(0)).toBe('0 Kč')
  })
})
