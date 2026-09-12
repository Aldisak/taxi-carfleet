import type { OrderSummaryDto, DriverSummaryDto } from '../api/client'

// ---------------------------------------------------------------------------
// Payload types from SignalR hub
// ---------------------------------------------------------------------------

/**
 * OrderChanged payload from the server — mirrors C# OrderChangedDto field-for-field.
 * C# OrderChangedDto positional params:
 *   1. Guid Id              → id: string
 *   2. Guid FleetId         → fleetId: string
 *   3. string PublicCode    → publicCode: string
 *   4. OrderStatus Status   → status: string | number  (numeric over SignalR without JsonStringEnumConverter)
 *   5. Guid? DriverId       → driverId: string | null
 *   6. Guid? CustomerUserId → customerUserId: string | null
 *   7. DateTimeOffset UpdatedAt → updatedAt: string
 *   8. int Version          → version: number
 *   9. string Source        → source: string  ("App" | "Dispatcher" | "Phone")
 *
 * Note: OrderStatus arrives as a number (0-6) since SignalR's default JSON protocol does not
 * apply FastEndpoints JsonStringEnumConverter.  This module normalizes to string.
 * OrderStatus numeric mapping: New=0, Assigned=1, Accepted=2, Arrived=3, InProgress=4, Completed=5, Cancelled=6
 * Source is serialized as a string by the backend (order.Source.ToString()) so it always arrives as "App" / "Dispatcher" / "Phone".
 */
export interface OrderChangedPayload {
  id: string
  fleetId: string
  publicCode: string
  status: string | number  // may arrive as number from SignalR
  driverId: string | null
  customerUserId: string | null
  updatedAt: string
  version: number
  source: string  // "App" | "Dispatcher" | "Phone"
}

/**
 * DriverStatusChanged payload: { driverId, status }.
 * DriverStatus numeric mapping: Offline=0, Free=1, EnRoute=2, Busy=3
 */
export interface DriverStatusChangedPayload {
  driverId: string
  status: string | number  // may arrive as number from SignalR
}

/** Cached per-order metadata for stale-version detection and sound logic. */
export interface CachedOrderVersion {
  version: number
  lastStatus?: string
}

// ---------------------------------------------------------------------------
// Enum normalization
// ---------------------------------------------------------------------------

const ORDER_STATUS_MAP: Record<number, string> = {
  0: 'New',
  1: 'Assigned',
  2: 'Accepted',
  3: 'Arrived',
  4: 'InProgress',
  5: 'Completed',
  6: 'Cancelled',
}

const DRIVER_STATUS_MAP: Record<number, string> = {
  0: 'Offline',
  1: 'Free',
  2: 'EnRoute',
  3: 'Busy',
}

/**
 * Normalizes an OrderStatus value from SignalR: converts numeric values to strings.
 * String values (if the server ever configures AddJsonProtocol) are passed through.
 */
export function normalizeOrderStatus(status: string | number): string {
  if (typeof status === 'number') {
    return ORDER_STATUS_MAP[status] ?? 'New'
  }
  return status
}

/**
 * Normalizes a DriverStatus value from SignalR: converts numeric values to strings.
 */
export function normalizeDriverStatus(status: string | number): string {
  if (typeof status === 'number') {
    return DRIVER_STATUS_MAP[status] ?? 'Offline'
  }
  return status
}

// ---------------------------------------------------------------------------
// Stale-version guard
// ---------------------------------------------------------------------------

/**
 * Returns true if the incoming event is stale and should be ignored.
 * An event is stale when incoming.version < the cached version for that orderId.
 * Equal or greater versions are always applied (idempotent / fresher update).
 */
export function shouldIgnoreOrderChanged(
  event: OrderChangedPayload,
  versions: Map<string, CachedOrderVersion>,
): boolean {
  const cached = versions.get(event.id)
  if (!cached) return false
  return event.version < cached.version
}

// ---------------------------------------------------------------------------
// Cache patch functions
// ---------------------------------------------------------------------------

/**
 * Applies an OrderChanged event to a list of OrderSummaryDto items.
 * Updates the matching order in-place (preserving all list-only fields).
 * If the order is not found in this list, returns the list unchanged —
 * the caller (useFleetHub) is responsible for invalidating filtered caches
 * that don't contain the order rather than poisoning them with stub entries.
 */
export function applyOrderChanged(
  items: OrderSummaryDto[],
  event: OrderChangedPayload,
): OrderSummaryDto[] {
  const normalizedStatus = normalizeOrderStatus(event.status)
  const idx = items.findIndex(o => o.id === event.id)

  if (idx === -1) {
    // Order not in this filtered list — return unchanged; caller must invalidate.
    return items
  }

  const updated: OrderSummaryDto = {
    ...items[idx],
    status: normalizedStatus,
    driverId: event.driverId,
  }

  return [...items.slice(0, idx), updated, ...items.slice(idx + 1)]
}

/**
 * Applies a DriverStatusChanged event to a list of DriverSummaryDto items.
 * Normalizes the status from numeric to string.
 */
export function applyDriverStatusChanged(
  items: DriverSummaryDto[],
  event: DriverStatusChangedPayload,
): DriverSummaryDto[] {
  const normalizedStatus = normalizeDriverStatus(event.status)
  return items.map(d =>
    d.driverId === event.driverId ? { ...d, status: normalizedStatus } : d,
  )
}

// ---------------------------------------------------------------------------
// Sound decision
// ---------------------------------------------------------------------------

export type SoundEvent = 'new-order' | 'decline' | null

/**
 * Determines whether a notification sound should play for an incoming OrderChanged event.
 *
 * Rules:
 * - 'new-order': the event has source === 'App', status New, and no prior cached entry
 *   (i.e. this is the first time we see this order — it arrived from the mobile app)
 * - 'decline': the cached lastStatus was Assigned and the incoming status is New
 *   (driver declined / offer timed out)
 * - null: no sound
 */
export function decideSound(
  event: OrderChangedPayload,
  versions: Map<string, CachedOrderVersion>,
): SoundEvent {
  const normalizedStatus = normalizeOrderStatus(event.status)
  const cached = versions.get(event.id)

  // Decline / timeout: was Assigned, now New
  if (cached?.lastStatus === 'Assigned' && normalizedStatus === 'New') {
    return 'decline'
  }

  // New App order arriving for the first time
  if (!cached && normalizedStatus === 'New' && event.source === 'App') {
    return 'new-order'
  }

  return null
}
