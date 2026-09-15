/** The minimal pickup-coordinate shape both OrderSummaryDto and OrderDetailDto satisfy. */
export interface PickupCoords {
  pickupLat?: number | null
  pickupLng?: number | null
}

/**
 * Whether an order is known to have NO usable pickup coordinates (UC-010 AC#2). This drives the
 * "bez souřadnic" ⚠ indicator: when suggest/geocode was degraded, the address is accepted without
 * coordinates, so the UI must flag that the order cannot be map-placed or distance-sorted.
 *
 * A coordinate is treated as MISSING only when it is explicitly `null` (backend says "no coords")
 * or the null-island (0,0) sentinel. `undefined` means the projection simply did not carry the
 * coordinate (the board list summary DTO omits coords entirely) — that is unknown, NOT
 * known-missing, so it must NOT flag every card (rules/web-architecture.md#pure-logic-modules).
 *
 * Accepts both OrderSummaryDto (board card — coords currently absent server-side) and
 * OrderDetailDto (order drawer — coords always present) via the structural PickupCoords shape.
 */
export function orderHasNoCoords(order: PickupCoords): boolean {
  const { pickupLat, pickupLng } = order
  // Undefined on BOTH → the projection omitted coords; we cannot tell → do not warn.
  if (pickupLat === undefined && pickupLng === undefined) return false
  // Any explicit null → known missing.
  if (pickupLat == null || pickupLng == null) return true
  // Null-island sentinel (0,0) is never a real pickup location.
  if (pickupLat === 0 && pickupLng === 0) return true
  return false
}
