/**
 * Pure route-leg selection for the driver map (UC-019 WI-1).
 *
 * Decides which route leg (if any) to fetch/draw for the active ride, from the order
 * status — mirroring rideButtonState's status vocabulary (Accepted / Arrived / InProgress).
 * No leaflet, no react, no fetch — pure so the map/geometry wiring stays unit-testable.
 */

/** The route leg to draw, or null when no leg applies. */
export type RouteLeg = 'toPickup' | 'toDropoff' | null

/** Inputs the route-leg decision reads. */
export interface RouteLegInput {
  /** The active order status string. */
  status: string
  /** Whether the order has a resolved dropoff location. */
  hasDropoff: boolean
}

/**
 * Selects the route leg to fetch/draw for the current status:
 * - Accepted / Arrived → 'toPickup' (the approach to the pickup, drawn until Start)
 * - InProgress → 'toDropoff' when a dropoff exists, else null (open ride, no destination)
 * - every other status (Free/Offline/New/Assigned/Completed/Cancelled/unknown) → null
 */
export function selectRouteLeg({ status, hasDropoff }: RouteLegInput): RouteLeg {
  switch (status) {
    case 'Accepted':
    case 'Arrived':
      return 'toPickup'
    case 'InProgress':
      return hasDropoff ? 'toDropoff' : null
    default:
      return null
  }
}

/** The subset of an order's coordinates the leg endpoint resolves from. */
export interface LegEndpointOrder {
  pickupLat: number
  pickupLng: number
  dropoffLat: number | null
  dropoffLng: number | null
}

/**
 * Resolves the geographic endpoint for a leg:
 * - 'toPickup' → the pickup coordinates
 * - 'toDropoff' → the dropoff coordinates, or null when the order has no dropoff
 * - null → null
 */
export function legEndpoint(
  leg: RouteLeg,
  order: LegEndpointOrder,
): { lat: number; lng: number } | null {
  if (leg === 'toPickup') {
    return { lat: order.pickupLat, lng: order.pickupLng }
  }
  if (leg === 'toDropoff') {
    if (order.dropoffLat == null || order.dropoffLng == null) return null
    return { lat: order.dropoffLat, lng: order.dropoffLng }
  }
  return null
}
