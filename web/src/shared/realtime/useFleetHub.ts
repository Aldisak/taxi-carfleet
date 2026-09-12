import { useEffect, useRef, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { useQueryClient } from '@tanstack/react-query'
import { createHubConnection } from './hubClient'
import { getReconnectDelay } from './reconnectBackoff'
import {
  shouldIgnoreOrderChanged,
  applyOrderChanged,
  applyDriverStatusChanged,
  decideSound,
  normalizeOrderStatus,
} from './eventReducer'
import type { OrderChangedPayload, DriverStatusChangedPayload, CachedOrderVersion } from './eventReducer'
import { usePositionStore } from './usePositionStore'
import { authStorage } from '../api/auth-storage'
import type { ListOrdersResponse, ListDriversResponse, OrderDetailDto } from '../api/client'
import { playNotificationSound } from '../sound/playNotificationSound'

export type ConnectionState = 'connected' | 'disconnected' | 'connecting' | 'reconnecting'

/**
 * Returns true when the connection state means the server is unreachable
 * and server-mutating actions should be disabled.
 *
 * NOTE: 'connecting' is NOT blocked — it is the initial boot state and
 * blocking it would disable all actions on first load before the hub connects.
 */
export function isServerActionBlocked(state: ConnectionState): boolean {
  return state === 'disconnected' || state === 'reconnecting'
}

interface DriverPositionChangedPayload {
  driverId: string
  lat: number
  lng: number
  heading: number | null
  speed: number | null
  at: string
}

/**
 * Connection state hook — returns the current SignalR connection state.
 * Consumed by DisconnectBanner and action buttons.
 * Alias of useHubConnectionState for WI-spec compatibility.
 */
export function useConnectionState(): ConnectionState {
  return useHubConnectionState()
}

// Module-level singleton state to prevent multiple hub connections
let hubInstance: signalR.HubConnection | null = null

/**
 * Invokes a hub method on the existing singleton connection.
 * No-ops (resolves false) when the hub is not currently connected — never builds a
 * second connection (rules/web-realtime.md#single-hub-singleton). Returns true on a
 * successful invoke; throws are propagated so callers can treat a failed send as "not sent".
 *
 * @param method  Hub method name (e.g. 'UpdatePosition').
 * @param args    Positional arguments forwarded to the hub method.
 */
export async function invokeHub(method: string, ...args: unknown[]): Promise<boolean> {
  if (!hubInstance || hubInstance.state !== signalR.HubConnectionState.Connected) {
    return false
  }
  await hubInstance.invoke(method, ...args)
  return true
}
const hubStateRef: { current: ConnectionState } = { current: 'disconnected' }
const stateListeners = new Set<(s: ConnectionState) => void>()

function notifyStateListeners(state: ConnectionState) {
  hubStateRef.current = state
  stateListeners.forEach(fn => fn(state))
}

/**
 * React hook that subscribes to connection state changes.
 * Returns the current connection state.
 */
export function useHubConnectionState(): ConnectionState {
  const [state, setState] = useState<ConnectionState>(hubStateRef.current)

  useEffect(() => {
    const handler = (s: ConnectionState) => setState(s)
    stateListeners.add(handler)
    return () => { stateListeners.delete(handler) }
  }, [])

  return state
}

/**
 * Mute state — persisted to localStorage.
 * Key is deliberately outside the hub so it survives hub reconnects.
 */
const MUTE_STORAGE_KEY = 'fleet_sound_muted'

export function getMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, muted ? 'true' : 'false')
  } catch {
    // ignore storage errors
  }
}

/**
 * Primary hook: connects to /hubs/fleet and wires event handlers to TanStack cache.
 * Call this once from a top-level component (e.g. BoardPage or Providers).
 *
 * @param enabled When false, the hook never builds or starts a connection (but still
 *   obeys the rules of hooks — callers always call it). Defaults to true so the
 *   dispatcher board and driver layout callers are unaffected. The customer public/none
 *   tracking mode passes false: /hubs/fleet is [Authorize], so a logged-out tracker has
 *   no token and would otherwise enter a doomed cold-start connect loop
 *   (rules/web-realtime.md#single-hub-singleton).
 */
export function useFleetHub(enabled: boolean = true) {
  const queryClient = useQueryClient()
  const updatePosition = usePositionStore(s => s.updatePosition)
  // Per-order version tracking for stale-event detection
  const versionMapRef = useRef<Map<string, CachedOrderVersion>>(new Map())

  useEffect(() => {
    // Skip STARTING a new connection when disabled — never tear down a shared singleton
    // others depend on (the cleanup below is intentionally a no-op either way).
    if (!enabled || hubInstance) return  // disabled, or already started

    const connection = createHubConnection(() => authStorage.getAccessToken())
    hubInstance = connection

    // ── Event handlers ──────────────────────────────────────────────────────

    connection.on('OrderChanged', (payload: OrderChangedPayload) => {
      if (shouldIgnoreOrderChanged(payload, versionMapRef.current)) return

      const soundEvent = decideSound(payload, versionMapRef.current)
      if (soundEvent) playNotificationSound(soundEvent)

      // Update version map — store normalized string status so decline detection works
      versionMapRef.current.set(payload.id, {
        version: payload.version,
        lastStatus: normalizeOrderStatus(payload.status),
      })

      // Patch each ['orders','list'] filtered cache independently:
      // - if the order exists in that cache → update in-place
      // - if absent → invalidate that exact query so it re-fetches (no stub poisoning)
      const listCaches = queryClient.getQueriesData<ListOrdersResponse>({ queryKey: ['orders', 'list'] })
      for (const [key, data] of listCaches) {
        if (!data) continue
        if (data.items.some(o => o.id === payload.id)) {
          queryClient.setQueryData<ListOrdersResponse>(
            key,
            old => old ? { ...old, items: applyOrderChanged(old.items, payload) } : old,
          )
        } else {
          void queryClient.invalidateQueries({ queryKey: key, exact: true })
        }
      }

      // Detail cache: patch in place FIRST for an instant status/driver update (cache-patch-not-
      // refetch, rules/web-realtime.md — the customer tracking headline and the dispatcher drawer
      // flip immediately without a blank), THEN invalidate so any active consumer refetches the
      // authoritative full detail. The OrderChanged payload carries only status/driverId/version —
      // price (finalPriceCzk on completion) and note are NOT in it, so the invalidate is what keeps
      // the dispatcher drawer's price/note correct. invalidate only refetches queries that are
      // currently observed; an unobserved cache keeps the optimistic patch for its next read.
      const detailKey = ['orders', 'detail', payload.id] as const
      queryClient.setQueryData<OrderDetailDto>(detailKey, old =>
        old
          ? {
              ...old,
              status: normalizeOrderStatus(payload.status),
              driverId: payload.driverId,
              version: payload.version,
            }
          : old,
      )
      void queryClient.invalidateQueries({ queryKey: detailKey })

      // Notify driver ride screen so it can detect order reassignment (F-04 live-clear).
      window.dispatchEvent(new CustomEvent('driver:orderChanged', { detail: payload }))
    })

    connection.on('DriverStatusChanged', (payload: DriverStatusChangedPayload) => {
      queryClient.setQueryData<ListDriversResponse>(
        ['drivers'],
        (old) => {
          if (!old) return old
          return { ...old, items: applyDriverStatusChanged(old.items, payload) }
        },
      )
      // Notify driver home screen so it can patch the ['driver','me'] cache for own status.
      window.dispatchEvent(new CustomEvent('driver:statusChanged', { detail: payload }))
    })

    connection.on('DriverPositionChanged', (payload: DriverPositionChangedPayload) => {
      updatePosition({
        driverId: payload.driverId,
        lat: payload.lat,
        lng: payload.lng,
        heading: payload.heading ?? null,
        speed: payload.speed ?? null,
        at: typeof payload.at === 'string' ? payload.at : new Date().toISOString(),
      })
    })

    // NewOrderOffered — two positional args: (orderDto, expiresAt).
    // Dispatched to driver:{driverId} group only. The dispatcher view receives nothing here.
    // Writes to the offer store so OfferTakeover can render.
    connection.on('NewOrderOffered', (dto: OrderDetailDto, expiresAt: string) => {
      // Dispatch a window event so the driver offer store can be updated without a circular import.
      window.dispatchEvent(new CustomEvent('driver:newOrderOffered', {
        detail: { dto, expiresAt },
      }))
    })

    // ── Connection lifecycle ────────────────────────────────────────────────

    connection.onreconnecting(() => {
      notifyStateListeners('reconnecting')
    })

    connection.onreconnected(() => {
      notifyStateListeners('connected')
      // Refetch to catch up on missed events
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['drivers'] })
    })

    connection.onclose(() => {
      notifyStateListeners('disconnected')
      hubInstance = null
    })

    // ── Start with cold-start retry loop ────────────────────────────────────
    // withAutomaticReconnect only engages after a successful initial connect.
    // We must retry the first connect ourselves using the same backoff schedule.

    let startAttempt = 0

    async function attemptStart(): Promise<void> {
      try {
        // Only show 'connecting' on the first attempt — retries stay in 'reconnecting'
        // so the disconnect banner and action guards remain active during cold-start retries
        if (startAttempt === 0) notifyStateListeners('connecting')
        await connection.start()
        notifyStateListeners('connected')
        // Catch up on events missed during the connection gap
        void queryClient.invalidateQueries({ queryKey: ['orders'] })
        void queryClient.invalidateQueries({ queryKey: ['drivers'] })
      } catch {
        // Start failed — go to reconnecting state (banner shows) and schedule retry
        notifyStateListeners('reconnecting')
        const delay = getReconnectDelay(startAttempt++)
        setTimeout(() => { void attemptStart() }, delay)
      }
    }

    void attemptStart()

    return () => {
      // Do NOT stop the connection on unmount — it's a singleton for the session.
      // The connection is only cleaned up on explicit logout / window close.
    }
  }, [enabled, queryClient, updatePosition])
}
