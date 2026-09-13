import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock the API client — never real network (rules/web-testing.md#network-mocking).
vi.mock('../api/client', () => ({
  pushSubscribe: vi.fn(),
  pushUnsubscribe: vi.fn(),
}))

// Mock the VAPID key reader (import.meta.env is not reliably mutable across module boundaries).
vi.mock('./pushConfig', () => ({
  getVapidPublicKey: vi.fn(() => 'aGVsbG8'),
}))

import { pushSubscribe, pushUnsubscribe } from '../api/client'
import { getVapidPublicKey } from './pushConfig'
import { usePushSubscription } from './usePushSubscription'

const mockSubscribe = vi.mocked(pushSubscribe)
const mockUnsubscribe = vi.mocked(pushUnsubscribe)
const mockVapidKey = vi.mocked(getVapidPublicKey)

/** A fake browser PushSubscription with the JSON the manager maps. */
function makeSubscription(endpoint = 'https://push.example/abc') {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'PKEY', auth: 'AKEY' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription
}

/**
 * Track what we patched onto the REAL jsdom window/navigator so we can clean up without
 * replacing the whole global (replacing window/navigator wholesale breaks the React renderer
 * that renderHook needs). We only add the push surface members.
 */
let cleanups: Array<() => void> = []

function defineTemp(target: object, key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(target, key)
  Object.defineProperty(target, key, { value, configurable: true, writable: true })
  cleanups.push(() => {
    if (desc) Object.defineProperty(target, key, desc)
    else delete (target as Record<string, unknown>)[key]
  })
}

/** Install a fake ServiceWorker + PushManager + Notification stack onto the real globals. */
function installPushStack(opts: {
  permission: NotificationPermission
  existing: PushSubscription | null
  subscribeResult?: PushSubscription
  requestPermissionResult?: NotificationPermission
}) {
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(opts.existing),
    subscribe: vi.fn().mockResolvedValue(opts.subscribeResult ?? makeSubscription()),
  }
  const registration = { pushManager }
  defineTemp(navigator, 'serviceWorker', { ready: Promise.resolve(registration) })
  defineTemp(navigator, 'userAgent', 'Mozilla/5.0 (Test)')
  defineTemp(window, 'PushManager', class {})
  const requestPermission = vi.fn().mockResolvedValue(opts.requestPermissionResult ?? 'granted')
  defineTemp(globalThis, 'Notification', { permission: opts.permission, requestPermission })
  return { pushManager, requestPermission }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVapidKey.mockReturnValue('aGVsbG8') // "hello" base64url
})

afterEach(() => {
  cleanups.forEach(fn => fn())
  cleanups = []
})

describe('usePushSubscription.ensureSubscribed', () => {
  it('returns "unsupported" and POSTs nothing in jsdom (no push stack)', async () => {
    // No stubs — jsdom navigator has no PushManager.
    const { result } = renderHook(() => usePushSubscription())
    await expect(result.current.ensureSubscribed()).resolves.toBe('unsupported')
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it('prompts, subscribes, and POSTs when permission is default and granted', async () => {
    const { requestPermission, pushManager } = installPushStack({ permission: 'default', existing: null })
    mockSubscribe.mockResolvedValue(undefined)
    const { result } = renderHook(() => usePushSubscription())

    await expect(result.current.ensureSubscribed()).resolves.toBe('subscribed')
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1)
    expect(mockSubscribe).toHaveBeenCalledWith({
      endpoint: 'https://push.example/abc',
      p256dh: 'PKEY',
      auth: 'AKEY',
      userAgent: 'Mozilla/5.0 (Test)',
    })
  })

  it('subscribes without prompting when permission is already granted', async () => {
    const { requestPermission } = installPushStack({ permission: 'granted', existing: null })
    mockSubscribe.mockResolvedValue(undefined)
    const { result } = renderHook(() => usePushSubscription())

    await expect(result.current.ensureSubscribed()).resolves.toBe('subscribed')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('returns "denied" and does not subscribe when the user denies the prompt', async () => {
    const { pushManager } = installPushStack({
      permission: 'default',
      existing: null,
      requestPermissionResult: 'denied',
    })
    const { result } = renderHook(() => usePushSubscription())

    await expect(result.current.ensureSubscribed()).resolves.toBe('denied')
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it('resyncs (re-POSTs) an existing subscription without re-subscribing', async () => {
    const existing = makeSubscription('https://push.example/existing')
    const { pushManager } = installPushStack({ permission: 'granted', existing })
    mockSubscribe.mockResolvedValue(undefined)
    const { result } = renderHook(() => usePushSubscription())

    await expect(result.current.ensureSubscribed()).resolves.toBe('resynced')
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(mockSubscribe).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example/existing' }),
    )
  })

  it('returns "no-key" when the VAPID key is not configured', async () => {
    mockVapidKey.mockReturnValue('')
    installPushStack({ permission: 'granted', existing: null })
    const { result } = renderHook(() => usePushSubscription())
    await expect(result.current.ensureSubscribed()).resolves.toBe('no-key')
    expect(mockSubscribe).not.toHaveBeenCalled()
  })
})

describe('usePushSubscription.unsubscribeLocal', () => {
  it('unsubscribes the browser subscription and DELETEs it server-side', async () => {
    const existing = makeSubscription('https://push.example/logout')
    installPushStack({ permission: 'granted', existing })
    mockUnsubscribe.mockResolvedValue(undefined)
    const { result } = renderHook(() => usePushSubscription())

    await result.current.unsubscribeLocal()
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1)
    expect(mockUnsubscribe).toHaveBeenCalledWith('https://push.example/logout')
  })

  it('no-ops when there is no existing subscription', async () => {
    installPushStack({ permission: 'granted', existing: null })
    const { result } = renderHook(() => usePushSubscription())
    await result.current.unsubscribeLocal()
    expect(mockUnsubscribe).not.toHaveBeenCalled()
  })

  it('no-ops in jsdom (unsupported)', async () => {
    const { result } = renderHook(() => usePushSubscription())
    await result.current.unsubscribeLocal()
    expect(mockUnsubscribe).not.toHaveBeenCalled()
  })
})
