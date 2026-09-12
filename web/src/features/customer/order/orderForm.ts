import type { CommonRouteDto, CreateOrderRequest } from '../../../shared/api/client'

/** Minimum passengers per order (spec §2: 1–4, "více, zavolejte"). */
export const MIN_PASSENGERS = 1

/** Maximum passengers per order before the "více, zavolejte" fallback. */
export const MAX_PASSENGERS = 4

/** Clamps a passenger count into the allowed 1..4 band (spec §2). */
export function clampPassengers(value: number): number {
  if (Number.isNaN(value)) return MIN_PASSENGERS
  return Math.min(MAX_PASSENGERS, Math.max(MIN_PASSENGERS, Math.trunc(value)))
}

/**
 * Whether the pickup/dropoff addresses are locked (non-editable) for a route type.
 * PointToPoint routes have both endpoints fixed (spec §2: "prefilled and locked"); Zone
 * and ZoneToZone let the customer supply a pickup within the zone (placeholder pre-06).
 */
export function isAddressLocked(route: CommonRouteDto): boolean {
  return route.type === 'PointToPoint'
}

/** Inputs for building a route-order create request. */
export interface RouteOrderInput {
  route: CommonRouteDto
  passengers: number
  /** ISO string for "Na čas", or null for "Hned". */
  scheduledAt: string | null
  /** Optional "Kde přesně vás vyzvedneme?" note. */
  note: string | null
}

/**
 * Builds the CreateOrderRequest for a common-route confirm order. Fixed-price, carries
 * the routeId so the backend prices/validates against the route.
 *
 * AC#1 reconciliation (laneA4b): routes/common now exposes the route's REAL pickup/dropoff
 * addresses + coordinates for PointToPoint routes, so we send those instead of the old
 * 0/0 placeholder — the backend CreateOrder validator requires non-empty pickupAddress AND
 * non-zero pickup coords, and a real 3-tap submit now succeeds (AC#1). The dropoff is
 * emitted ALL-OR-NOTHING: the validator rejects a non-null dropoffAddress that lacks
 * dropoff coords, so we only include the dropoff when BOTH dropoffLat and dropoffLng are
 * present (a pickup-only PointToPoint route sends no dropoff). Zone/ZoneToZone routes have
 * no coords pre-06 and are not submittable through this builder (the page shows a
 * placeholder for them); we fall back to the route name + 0 to keep the type total, but
 * that path is never exercised (isAddressLocked gates Objednat to PointToPoint).
 */
export function buildRouteOrderRequest(input: RouteOrderInput): CreateOrderRequest {
  const { route, passengers, scheduledAt, note } = input

  const hasDropoff = route.dropoffLat != null && route.dropoffLng != null

  return {
    pickupAddress: route.pickupAddress ?? route.name,
    pickupLat: route.pickupLat ?? 0,
    pickupLng: route.pickupLng ?? 0,
    dropoffAddress: hasDropoff ? (route.dropoffAddress ?? route.name) : null,
    dropoffLat: hasDropoff ? route.dropoffLat : null,
    dropoffLng: hasDropoff ? route.dropoffLng : null,
    scheduledAt,
    note,
    passengers: clampPassengers(passengers),
    priceType: 'Fixed',
    fixedPriceCzk: route.priceCzk,
    routeId: route.id,
  }
}
