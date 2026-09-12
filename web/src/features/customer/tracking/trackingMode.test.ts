import { describe, it, expect } from 'vitest'
import { resolveTrackingMode } from './trackingMode'

describe('resolveTrackingMode', () => {
  it('returns authed when a customer access token is present', () => {
    expect(resolveTrackingMode({ hasToken: true, linkToken: null })).toBe('authed')
  })

  it('returns authed when both a token and a ?k= link token are present (token wins)', () => {
    expect(resolveTrackingMode({ hasToken: true, linkToken: 'abc' })).toBe('authed')
  })

  it('returns public when logged out but a ?k= link token is present', () => {
    expect(resolveTrackingMode({ hasToken: false, linkToken: 'abc' })).toBe('public')
  })

  it('returns none when logged out and there is no ?k= link token', () => {
    expect(resolveTrackingMode({ hasToken: false, linkToken: null })).toBe('none')
  })

  it('treats an empty-string link token as absent', () => {
    expect(resolveTrackingMode({ hasToken: false, linkToken: '' })).toBe('none')
  })
})
