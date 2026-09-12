/**
 * Integration tests for useFleetHub: fake HubConnection + module isolation.
 *
 * Each test uses vi.resetModules() + dynamic import so the module-level
 * hubInstance singleton is fresh (avoiding cross-test pollution).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// --------------------------------------------------------------------------
// Fake HubConnection factory
// --------------------------------------------------------------------------

function makeFakeConnection() {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
  let _onreconnecting: (() => void) | null = null
  let _onreconnected: (() => void) | null = null
  let _onclose: (() => void) | null = null

  const conn = {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = []
      handlers[event].push(cb)
    }),
    onreconnecting: vi.fn((cb: () => void) => { _onreconnecting = cb }),
    onreconnected: vi.fn((cb: () => void) => { _onreconnected = cb }),
    onclose: vi.fn((cb: () => void) => { _onclose = cb }),
    start: vi.fn(() => Promise.resolve()),
    // Test helpers to fire events
    fireEvent: (event: string, ...args: unknown[]) => {
      handlers[event]?.forEach(cb => cb(...args))
    },
    fireReconnecting: () => _onreconnecting?.(),
    fireReconnected: () => _onreconnected?.(),
    fireClose: () => _onclose?.(),
  }
  return conn
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function wrapper(queryClient: QueryClient) {
  return function WrapperComponent({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useFleetHub — reconnect invalidates queries', () => {
  it('invalidates [orders] and [drivers] on reconnect', async () => {
    const fakeConn = makeFakeConnection()

    vi.doMock('./hubClient', () => ({
      createHubConnection: vi.fn(() => fakeConn),
    }))

    const { useFleetHub } = await import('./useFleetHub')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    renderHook(() => useFleetHub(), { wrapper: wrapper(queryClient) })

    // Wait for start() to resolve
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    invalidateSpy.mockClear()

    act(() => { fakeConn.fireReconnected() })

    // Should invalidate both query prefixes
    const calledKeys = invalidateSpy.mock.calls.map(call => {
      const arg = call[0] as { queryKey?: unknown }
      return JSON.stringify(arg?.queryKey)
    })

    expect(calledKeys).toContain(JSON.stringify(['orders']))
    expect(calledKeys).toContain(JSON.stringify(['drivers']))
  })
})

describe('useHubConnectionState — banner state transitions', () => {
  it('transitions from connecting to connected to reconnecting to connected', async () => {
    const fakeConn = makeFakeConnection()

    vi.doMock('./hubClient', () => ({
      createHubConnection: vi.fn(() => fakeConn),
    }))

    const { useFleetHub, useHubConnectionState } = await import('./useFleetHub')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const stateHistory: string[] = []

    // Render the state hook in the same wrapper
    const { result: stateResult } = renderHook(
      () => useHubConnectionState(),
      { wrapper: wrapper(queryClient) },
    )

    // Render the hub hook which starts the connection
    renderHook(() => useFleetHub(), { wrapper: wrapper(queryClient) })

    // Initial state should be connecting or connected (after start resolves)
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    stateHistory.push(stateResult.current)

    // Simulate reconnecting
    act(() => { fakeConn.fireReconnecting() })
    stateHistory.push(stateResult.current)

    // Simulate reconnected
    act(() => { fakeConn.fireReconnected() })
    stateHistory.push(stateResult.current)

    // After reconnecting → should become 'reconnecting', then 'connected'
    expect(stateHistory).toContain('reconnecting')
    expect(stateHistory[stateHistory.length - 1]).toBe('connected')
  })

  it('returns disconnected when connection closes', async () => {
    const fakeConn = makeFakeConnection()

    vi.doMock('./hubClient', () => ({
      createHubConnection: vi.fn(() => fakeConn),
    }))

    const { useFleetHub, useHubConnectionState } = await import('./useFleetHub')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result: stateResult } = renderHook(
      () => useHubConnectionState(),
      { wrapper: wrapper(queryClient) },
    )

    renderHook(() => useFleetHub(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    act(() => { fakeConn.fireClose() })

    expect(stateResult.current).toBe('disconnected')
  })
})

describe('useFleetHub — F5: OrderChanged invalidates absent-order caches, patches present-order caches', () => {
  it('patches cache where order exists and invalidates (not inserts) cache where order is absent', async () => {
    const fakeConn = makeFakeConnection()

    vi.doMock('./hubClient', () => ({
      createHubConnection: vi.fn(() => fakeConn),
    }))
    vi.doMock('../sound/playNotificationSound', () => ({
      playNotificationSound: vi.fn(),
    }))

    const { useFleetHub } = await import('./useFleetHub')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    // Seed two filtered caches:
    // cache A has the order we're about to change
    // cache B is a different filter (e.g. search results) that does NOT contain the order
    const cacheKeyA = ['orders', 'list', { status: 'New' }]
    const cacheKeyB = ['orders', 'list', { status: 'Completed' }]

    queryClient.setQueryData(cacheKeyA, {
      items: [{ id: 'order-test', status: 'New', publicCode: 'T-001', driverId: null, source: 'Dispatcher', customerPhone: '', customerName: null, pickupAddress: '', dropoffAddress: null, scheduledAt: null, passengers: 1, priceType: 'Meter', estimatedPriceCzk: null, fixedPriceCzk: null, createdAt: '2024-01-01T10:00:00Z' }],
      totalCount: 1,
    })
    queryClient.setQueryData(cacheKeyB, {
      items: [{ id: 'order-other', status: 'Completed', publicCode: 'T-002', driverId: null, source: 'Dispatcher', customerPhone: '', customerName: null, pickupAddress: '', dropoffAddress: null, scheduledAt: null, passengers: 1, priceType: 'Meter', estimatedPriceCzk: null, fixedPriceCzk: null, createdAt: '2024-01-01T09:00:00Z' }],
      totalCount: 1,
    })

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData')

    renderHook(() => useFleetHub(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    invalidateSpy.mockClear()
    setQueryDataSpy.mockClear()

    act(() => {
      fakeConn.fireEvent('OrderChanged', {
        id: 'order-test',
        fleetId: 'fleet-1',
        publicCode: 'T-001',
        status: 'Assigned',
        driverId: 'driver-1',
        customerUserId: null,
        updatedAt: new Date().toISOString(),
        version: 2,
        source: 'Dispatcher',
      })
    })

    // cacheA (has the order) should be updated via setQueryData
    const setQueryCalls = setQueryDataSpy.mock.calls.map(c => JSON.stringify(c[0]))
    expect(setQueryCalls.some(k => k.includes('status'))).toBe(true)

    // cacheB (does NOT have the order) should be invalidated (not patched)
    const invalidateCalls = invalidateSpy.mock.calls.map(c => JSON.stringify((c[0] as { queryKey?: unknown })?.queryKey))
    expect(invalidateCalls.some(k => k.includes('Completed'))).toBe(true)

    // cacheB must NOT have the order injected as a stub
    const cacheBData = queryClient.getQueryData<{ items: { id: string }[] }>(cacheKeyB)
    expect(cacheBData?.items.find(o => o.id === 'order-test')).toBeUndefined()
  })
})

describe('useFleetHub — decline sound regression (numeric status)', () => {
  it('calls playNotificationSound("decline") when status 1→0 (Assigned→New) via numeric hub enums', async () => {
    const fakeConn = makeFakeConnection()
    const soundSpy = vi.fn()

    vi.doMock('./hubClient', () => ({
      createHubConnection: vi.fn(() => fakeConn),
    }))
    vi.doMock('../sound/playNotificationSound', () => ({
      playNotificationSound: soundSpy,
    }))

    const { useFleetHub } = await import('./useFleetHub')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    renderHook(() => useFleetHub(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    // First event: status=1 (Assigned) — no sound, sets version map
    // All 9 fields mirror C# OrderChangedDto field-for-field
    act(() => {
      fakeConn.fireEvent('OrderChanged', {
        id: 'order-test',
        fleetId: 'fleet-1',
        publicCode: 'T-001',
        status: 1,  // numeric 1 = Assigned
        driverId: 'driver-1',
        customerUserId: null,
        updatedAt: new Date().toISOString(),
        version: 1,
        source: 'Dispatcher',
      })
    })

    expect(soundSpy).not.toHaveBeenCalled()

    // Second event: status=0 (New) — driver declined, should play 'decline'
    // All 9 fields mirror C# OrderChangedDto field-for-field
    act(() => {
      fakeConn.fireEvent('OrderChanged', {
        id: 'order-test',
        fleetId: 'fleet-1',
        publicCode: 'T-001',
        status: 0,  // numeric 0 = New (decline/timeout)
        driverId: null,
        customerUserId: null,
        updatedAt: new Date().toISOString(),
        version: 2,
        source: 'Dispatcher',
      })
    })

    expect(soundSpy).toHaveBeenCalledWith('decline')
  })
})

describe('useFleetHub — F4: cold-start retry on initial start() failure', () => {
  it('retries connection after start() fails, transitions to connected on eventual success', async () => {
    vi.useFakeTimers()

    let startCallCount = 0
    const fakeConn = makeFakeConnection()
    // Override start: first 3 calls fail (uses getReconnectDelay: 0, 2000, 5000 ms between retries), 4th succeeds
    fakeConn.start = vi.fn(async () => {
      startCallCount++
      if (startCallCount <= 3) {
        throw new Error(`start failure #${startCallCount}`)
      }
      // 4th attempt succeeds
    })

    vi.doMock('./hubClient', () => ({
      createHubConnection: vi.fn(() => fakeConn),
    }))
    vi.doMock('../sound/playNotificationSound', () => ({
      playNotificationSound: vi.fn(),
    }))

    const { useFleetHub, useHubConnectionState } = await import('./useFleetHub')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result: stateResult } = renderHook(
      () => useHubConnectionState(),
      { wrapper: wrapper(queryClient) },
    )
    renderHook(() => useFleetHub(), { wrapper: wrapper(queryClient) })

    // Initial start attempt fires synchronously — advance microtasks + 0ms timers
    await act(async () => {
      // Let first attempt run and schedule the 0ms retry
      await vi.advanceTimersByTimeAsync(0)
    })
    // First call failed and scheduled a 0ms timer for the second call
    // Second call should also have fired (0ms), scheduled a 2000ms timer for the third
    expect(startCallCount).toBeGreaterThanOrEqual(2)
    // Should be in reconnecting state (not yet succeeded)
    expect(stateResult.current).toBe('reconnecting')

    // Advance past the 2000ms timer → triggers attempt 3
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(startCallCount).toBeGreaterThanOrEqual(3)
    expect(stateResult.current).toBe('reconnecting')  // still failing

    // Advance past the 5000ms timer → triggers attempt 4 (succeeds)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(startCallCount).toBe(4)
    // After success, state transitions to connected
    expect(stateResult.current).toBe('connected')

    // On recovery, should invalidate orders + drivers (catch-up)
    const calledKeys = invalidateSpy.mock.calls.map(call => {
      const arg = call[0] as { queryKey?: unknown }
      return JSON.stringify(arg?.queryKey)
    })
    expect(calledKeys).toContain(JSON.stringify(['orders']))
    expect(calledKeys).toContain(JSON.stringify(['drivers']))
  })
})

describe('useFleetHub — enabled gate', () => {
  it('does NOT build or start the connection when enabled=false (public/none tracking mode)', async () => {
    const fakeConn = makeFakeConnection()
    const createHubConnection = vi.fn(() => fakeConn)

    vi.doMock('./hubClient', () => ({ createHubConnection }))

    const { useFleetHub } = await import('./useFleetHub')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    renderHook(() => useFleetHub(false), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    // No doomed authed /hubs/fleet connect loop on a logged-out public tracker.
    expect(createHubConnection).not.toHaveBeenCalled()
    expect(fakeConn.start).not.toHaveBeenCalled()
  })

  it('builds and starts the connection when enabled defaults to true (dispatcher/driver/authed)', async () => {
    const fakeConn = makeFakeConnection()
    const createHubConnection = vi.fn(() => fakeConn)

    vi.doMock('./hubClient', () => ({ createHubConnection }))

    const { useFleetHub } = await import('./useFleetHub')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    renderHook(() => useFleetHub(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    expect(createHubConnection).toHaveBeenCalledTimes(1)
    expect(fakeConn.start).toHaveBeenCalled()
  })
})
