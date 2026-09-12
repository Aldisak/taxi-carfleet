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
import type { ListOrdersResponse, ListDriversResponse } from '../api/client'
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
 */
export function useFleetHub() {
  const queryClient = useQueryClient()
  const updatePosition = usePositionStore(s => s.updatePosition)
  // Per-order version tracking for stale-event detection
  const versionMapRef = useRef<Map<string, CachedOrderVersion>>(new Map())

  useEffect(() => {
    if (hubInstance) return  // already started

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

      // Invalidate detail cache for this order so the drawer refetches
      void queryClient.invalidateQueries({ queryKey: ['orders', 'detail', payload.id] })
    })

    connection.on('DriverStatusChanged', (payload: DriverStatusChangedPayload) => {
      queryClient.setQueryData<ListDriversResponse>(
        ['drivers'],
        (old) => {
          if (!old) return old
          return { ...old, items: applyDriverStatusChanged(old.items, payload) }
        },
      )
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

    // NewOrderOffered — no dispatcher UI in v1; log only
    connection.on('NewOrderOffered', () => {
      // Intentionally ignored in dispatcher view v1.
      // The offer is rendered in the driver app. No dispatcher UI needed.
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
  }, [queryClient, updatePosition])
}
