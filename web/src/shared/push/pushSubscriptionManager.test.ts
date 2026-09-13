import { describe, it, expect } from 'vitest'
import {
  decideSubscribe,
  vapidKeyToApplicationServerKey,
  toSubscribeRequest,
} from './pushSubscriptionManager'

describe('decideSubscribe', () => {
  it('skips when push is unsupported', () => {
    expect(decideSubscribe({ supported: false, permission: 'default', hasExistingSubscription: false }))
      .toEqual({ action: 'skip', reason: 'unsupported' })
  })

  it('skips when the user has denied notifications', () => {
    expect(decideSubscribe({ supported: true, permission: 'denied', hasExistingSubscription: false }))
      .toEqual({ action: 'skip', reason: 'denied' })
  })

  it('resyncs when a subscription already exists (idempotent upsert)', () => {
    expect(decideSubscribe({ supported: true, permission: 'granted', hasExistingSubscription: true }))
      .toEqual({ action: 'resync' })
  })

  it('subscribes without prompting when permission is already granted', () => {
    expect(decideSubscribe({ supported: true, permission: 'granted', hasExistingSubscription: false }))
      .toEqual({ action: 'subscribe', prompt: false })
  })

  it('subscribes with a prompt when permission is undecided', () => {
    expect(decideSubscribe({ supported: true, permission: 'default', hasExistingSubscription: false }))
      .toEqual({ action: 'subscribe', prompt: true })
  })
})

describe('vapidKeyToApplicationServerKey', () => {
  it('converts a url-safe base64 key to a Uint8Array of the decoded length', () => {
    // "hello" base64url = "aGVsbG8" (no padding)
    const result = vapidKeyToApplicationServerKey('aGVsbG8')
    expect(result).toBeInstanceOf(Uint8Array)
    expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]) // "hello"
  })

  it('handles the - and _ url-safe substitutions', () => {
    // bytes [0xfb, 0xff] => standard base64 "+/8=" => url-safe "-_8"
    const result = vapidKeyToApplicationServerKey('-_8')
    expect(Array.from(result)).toEqual([0xfb, 0xff])
  })
})

describe('toSubscribeRequest', () => {
  it('maps a full subscription JSON to the API request', () => {
    const json: PushSubscriptionJSON = {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'PKEY', auth: 'AKEY' },
    }
    expect(toSubscribeRequest(json, 'Mozilla/5.0')).toEqual({
      endpoint: 'https://push.example/abc',
      p256dh: 'PKEY',
      auth: 'AKEY',
      userAgent: 'Mozilla/5.0',
    })
  })

  it('omits userAgent when empty/undefined', () => {
    const json: PushSubscriptionJSON = {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'PKEY', auth: 'AKEY' },
    }
    expect(toSubscribeRequest(json, undefined)?.userAgent).toBeUndefined()
    expect(toSubscribeRequest(json, '')?.userAgent).toBeUndefined()
  })

  it('returns null when keys are missing', () => {
    expect(toSubscribeRequest({ endpoint: 'https://push.example/abc' }, 'UA')).toBeNull()
    expect(toSubscribeRequest({ endpoint: 'https://push.example/abc', keys: { p256dh: 'x' } } as PushSubscriptionJSON, 'UA')).toBeNull()
  })

  it('returns null when the endpoint is missing', () => {
    expect(toSubscribeRequest({ keys: { p256dh: 'x', auth: 'y' } } as PushSubscriptionJSON, 'UA')).toBeNull()
  })
})
