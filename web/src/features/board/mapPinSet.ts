/** Minimal order data needed to derive a map pickup pin. */
export interface PinnableOrder {
  id: string
  status: string
  pickupLat: number | null
  pickupLng: number | null
  pickupAddress: string
  publicCode: string
}

/** A map pickup pin ready for rendering. */
export interface OrderPickupPin {
  id: string
  lat: number
  lng: number
  address: string
  publicCode: string
}

/** Order statuses that should show a pickup pin on the map. */
const PINNABLE_STATUSES = new Set(['New', 'Assigned'])

/**
 * Derives the set of pickup pins to render on the map from the active orders list.
 * Only New/Assigned orders with known coordinates produce a pin.
 */
export function derivePinSet(orders: PinnableOrder[]): OrderPickupPin[] {
  const pins: OrderPickupPin[] = []

  for (const order of orders) {
    if (!PINNABLE_STATUSES.has(order.status)) continue
    if (order.pickupLat == null || order.pickupLng == null) continue

    pins.push({
      id: order.id,
      lat: order.pickupLat,
      lng: order.pickupLng,
      address: order.pickupAddress,
      publicCode: order.publicCode,
    })
  }

  return pins
}
