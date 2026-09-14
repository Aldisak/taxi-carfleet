import { describe, it, expect } from 'vitest'
import {
  parsePushPayload,
  toPushDisplay,
  resolveClickUrl,
  OFFER_TAG,
  type RawPushPayload,
} from './pushPayload'

describe('parsePushPayload', () => {
  it('returns null for missing or empty data', () => {
    expect(parsePushPayload(null)).toBeNull()
    expect(parsePushPayload(undefined)).toBeNull()
    expect(parsePushPayload('')).toBeNull()
  })

  it('returns null for non-JSON data', () => {
    expect(parsePushPayload('not-json{')).toBeNull()
  })

  it('returns null when the title is missing (unusable payload)', () => {
    expect(parsePushPayload(JSON.stringify({ body: 'x' }))).toBeNull()
  })

  it('parses a full payload', () => {
    const raw = JSON.stringify({
      title: 'Nová nabídka',
      body: 'Václavské náměstí',
      url: '/driver',
      tag: 'offer',
      priority: 'high',
    })
    expect(parsePushPayload(raw)).toEqual<RawPushPayload>({
      title: 'Nová nabídka',
      body: 'Václavské náměstí',
      url: '/driver',
      tag: 'offer',
      priority: 'high',
    })
  })

  it('defaults body to empty and drops unknown priority values', () => {
    const raw = JSON.stringify({ title: 'T', priority: 'weird' })
    expect(parsePushPayload(raw)).toEqual<RawPushPayload>({
      title: 'T',
      body: '',
      url: undefined,
      tag: undefined,
      priority: undefined,
    })
  })
})

describe('toPushDisplay', () => {
  it('maps a normal payload without requireInteraction', () => {
    const display = toPushDisplay({ title: 'Řidič dorazil', body: 'SPZ 1AB 2345', url: '/customer/t/ABC', priority: 'normal' })
    expect(display).toEqual({
      title: 'Řidič dorazil',
      body: 'SPZ 1AB 2345',
      url: '/customer/t/ABC',
      tag: null,
      requireInteraction: false,
      isOffer: false,
    })
  })

  it('marks a high-priority payload as an offer requiring interaction', () => {
    const display = toPushDisplay({ title: 'Nová nabídka', body: 'x', url: '/driver', priority: 'high' })
    expect(display.requireInteraction).toBe(true)
    expect(display.isOffer).toBe(true)
  })

  it('treats the offer tag as an offer even without high priority', () => {
    const display = toPushDisplay({ title: 'Nová nabídka', body: 'x', tag: OFFER_TAG })
    expect(display.requireInteraction).toBe(true)
    expect(display.isOffer).toBe(true)
    expect(display.tag).toBe('offer')
  })

  it('passes url through as null when absent', () => {
    const display = toPushDisplay({ title: 'T', body: 'b' })
    expect(display.url).toBeNull()
  })
})

describe('resolveClickUrl', () => {
  it('returns the url when present', () => {
    expect(resolveClickUrl('/customer/t/ABC')).toBe('/customer/t/ABC')
  })

  it('falls back to the app root when absent', () => {
    expect(resolveClickUrl(null)).toBe('/')
    expect(resolveClickUrl(undefined)).toBe('/')
    expect(resolveClickUrl('')).toBe('/')
  })
})
