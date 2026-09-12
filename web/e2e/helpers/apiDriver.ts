/**
 * API helper for E2E tests — driver-side operations performed directly against the API
 * (bypassing the UI) to set up state for realtime assertions.
 *
 * All requests go to the API at http://localhost:5249 (direct, not via the Vite proxy),
 * sending both `Authorization: Bearer` and `X-Fleet-Slug: demo` headers.
 */

const API_BASE = 'http://localhost:5249/api/v1'

export interface DriverSession {
  accessToken: string
  driverId: string | null
}

/**
 * Logs in as the specified driver via the staff login endpoint.
 * Returns the access token and (if available) the driver's own row ID.
 */
export async function loginAsDriver(
  email: string,
  password: string,
  fleetSlug = 'demo',
): Promise<DriverSession> {
  const res = await fetch(`${API_BASE}/auth/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fleetSlug, email, password }),
  })
  if (!res.ok) {
    throw new Error(`Driver login failed: ${res.status} ${await res.text()}`)
  }
  const body = await res.json() as { accessToken: string; user: { id: string } }
  return { accessToken: body.accessToken, driverId: body.user.id }
}

/**
 * Attempts to go online with the given vehicle ID.
 * If the driver is already online (409), treats it as success (seeder starts drivers as Free).
 */
export async function goOnline(
  session: DriverSession,
  vehicleId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/drivers/me/online`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.accessToken}`,
      'X-Fleet-Slug': 'demo',
    },
    body: JSON.stringify({ vehicleId }),
  })
  if (res.status === 409) {
    // Already online — fine (seeder leaves driver1 as Free/online)
    return
  }
  if (!res.ok) {
    throw new Error(`goOnline failed: ${res.status} ${await res.text()}`)
  }
}

/**
 * Accepts an order on behalf of the driver.
 * POST /orders/{orderId}/accept (no body, driver JWT required).
 */
export async function acceptOrder(
  session: DriverSession,
  orderId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/accept`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.accessToken}`,
      'X-Fleet-Slug': 'demo',
    },
  })
  if (!res.ok) {
    throw new Error(`acceptOrder failed: ${res.status} ${await res.text()}`)
  }
}

/**
 * Lists all drivers via the dispatcher API and returns the first online (Free) driver's ID.
 * Used when the test needs to find driver1's internal row ID for go-online.
 */
export async function listDrivers(dispatcherToken: string): Promise<Array<{
  driverId: string
  displayName: string
  status: string
  currentVehiclePlate: string | null
}>> {
  const res = await fetch(`${API_BASE}/drivers`, {
    headers: {
      'Authorization': `Bearer ${dispatcherToken}`,
      'X-Fleet-Slug': 'demo',
    },
  })
  if (!res.ok) {
    throw new Error(`listDrivers failed: ${res.status} ${await res.text()}`)
  }
  const body = await res.json() as { items: Array<{ driverId: string; displayName: string; status: string; currentVehiclePlate: string | null }> }
  return body.items
}

/**
 * Logs in as the dispatcher and returns the access token.
 */
export async function loginAsDispatcher(
  email = 'dispatcher@demo.local',
  password = 'Demo1234!',
  fleetSlug = 'demo',
): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fleetSlug, email, password }),
  })
  if (!res.ok) {
    throw new Error(`Dispatcher login failed: ${res.status} ${await res.text()}`)
  }
  const body = await res.json() as { accessToken: string }
  return body.accessToken
}

// ── UC-003 (B-e2e) extensions ────────────────────────────────────────────────
// Added for the mobile driver specs: dispatcher create/assign/cancel + order reads
// + driver go-offline + order-event counting (AC#5 exactly-once proof).
// The existing helpers above are NOT modified.

const FLEET_HEADERS = (token: string) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`,
  'X-Fleet-Slug': 'demo',
})

/** Minimal order shape returned by GET /orders/{id} and the create/assign envelopes. */
export interface OrderDetail {
  id: string
  publicCode: string
  status: string
  driverId: string | null
  priceType: string
  fixedPriceCzk: number | null
  estimatedPriceCzk: number | null
  finalPriceCzk: number | null
  paymentType: string | null
}

/**
 * Dispatcher creates a new order. Defaults to a FIXED-price order (AC#2 needs a
 * locked fixed price on the complete screen). Returns the created order.
 * The API wraps the payload as { order: OrderDetailDto } (CreateOrderResponse envelope).
 */
export async function createOrder(
  dispatcherToken: string,
  opts: {
    customerPhone: string
    priceType?: 'Fixed' | 'Estimate' | 'Meter'
    fixedPriceCzk?: number
    estimatedPriceCzk?: number
    pickupAddress?: string
    customerName?: string
  },
): Promise<OrderDetail> {
  const body = {
    pickupAddress: opts.pickupAddress ?? 'Náměstí Republiky, Kolín',
    pickupLat: 50.0281,
    pickupLng: 15.2006,
    dropoffAddress: 'Kutná Hora centrum',
    dropoffLat: 49.9481,
    dropoffLng: 15.2681,
    customerPhone: opts.customerPhone,
    customerName: opts.customerName ?? 'E2E zákazník',
    passengers: 1,
    priceType: opts.priceType ?? 'Fixed',
    fixedPriceCzk: (opts.priceType ?? 'Fixed') === 'Fixed' ? (opts.fixedPriceCzk ?? 250) : null,
    estimatedPriceCzk: opts.priceType === 'Estimate' ? (opts.estimatedPriceCzk ?? 200) : null,
  }
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: FLEET_HEADERS(dispatcherToken),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`createOrder failed: ${res.status} ${await res.text()}`)
  }
  const json = await res.json() as { order: OrderDetail }
  return json.order
}

/**
 * Dispatcher assigns an order to a driver (by driver row ID). The API uses the
 * driver's current vehicle. Returns the updated order.
 */
export async function assignOrder(
  dispatcherToken: string,
  orderId: string,
  driverId: string,
): Promise<OrderDetail> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/assign`, {
    method: 'POST',
    headers: FLEET_HEADERS(dispatcherToken),
    body: JSON.stringify({ driverId }),
  })
  if (!res.ok) {
    throw new Error(`assignOrder failed: ${res.status} ${await res.text()}`)
  }
  const json = await res.json() as { order: OrderDetail }
  return json.order
}

/** Dispatcher cancels an order (used to release a seeded driver in beforeAll). */
export async function cancelOrder(
  dispatcherToken: string,
  orderId: string,
  reason = 'E2E setup',
): Promise<void> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: FLEET_HEADERS(dispatcherToken),
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) {
    throw new Error(`cancelOrder failed: ${res.status} ${await res.text()}`)
  }
}

/** Reads a single order (dispatcher token). */
export async function getOrder(token: string, orderId: string): Promise<OrderDetail> {
  const res = await fetch(`${API_BASE}/orders/${orderId}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'X-Fleet-Slug': 'demo' },
  })
  if (!res.ok) {
    throw new Error(`getOrder failed: ${res.status} ${await res.text()}`)
  }
  const json = await res.json() as { order: OrderDetail }
  return json.order
}

/** Lists a driver's non-terminal orders (dispatcher token). */
export async function listOrdersByDriver(
  dispatcherToken: string,
  driverId: string,
): Promise<OrderDetail[]> {
  const res = await fetch(`${API_BASE}/orders?driverId=${driverId}&pageSize=200`, {
    headers: { 'Authorization': `Bearer ${dispatcherToken}`, 'X-Fleet-Slug': 'demo' },
  })
  if (!res.ok) {
    throw new Error(`listOrdersByDriver failed: ${res.status} ${await res.text()}`)
  }
  const json = await res.json() as { items: OrderDetail[] }
  return json.items
}

/** The calling driver's own profile (GET /drivers/me). */
export interface DriverMe {
  driverId: string
  status: string
  currentVehicleId: string | null
  currentVehiclePlate: string | null
  activeOrderId: string | null
}

/** Reads the calling driver's own profile. */
export async function getMe(session: DriverSession): Promise<DriverMe> {
  const res = await fetch(`${API_BASE}/drivers/me`, {
    headers: { 'Authorization': `Bearer ${session.accessToken}`, 'X-Fleet-Slug': 'demo' },
  })
  if (!res.ok) {
    throw new Error(`getMe failed: ${res.status} ${await res.text()}`)
  }
  return await res.json() as DriverMe
}

/** Sets the driver offline. Tolerates 409 (already offline). */
export async function goOffline(session: DriverSession): Promise<void> {
  const res = await fetch(`${API_BASE}/drivers/me/offline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session.accessToken}`, 'X-Fleet-Slug': 'demo' },
  })
  if (res.status === 409) return
  if (!res.ok) {
    throw new Error(`goOffline failed: ${res.status} ${await res.text()}`)
  }
}

/**
 * Counts order events of a given type via the dispatcher event feed
 * (GET /orders/{id}/events). Used to prove AC#5 exactly-once: a single queued-then-
 * replayed transition must record exactly ONE server-side event of its type.
 */
export async function countOrderEventsByType(
  dispatcherToken: string,
  orderId: string,
  eventType: string,
): Promise<number> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/events`, {
    headers: { 'Authorization': `Bearer ${dispatcherToken}`, 'X-Fleet-Slug': 'demo' },
  })
  if (!res.ok) {
    throw new Error(`getOrderEvents failed: ${res.status} ${await res.text()}`)
  }
  const json = await res.json() as { events: Array<{ type: string; toStatus: string }> }
  return json.events.filter(e => e.type === eventType).length
}

/** Polls an order until its status matches, or throws after the timeout. */
export async function waitForOrderStatus(
  token: string,
  orderId: string,
  expectedStatus: string,
  timeoutMs = 5000,
  intervalMs = 200,
): Promise<OrderDetail> {
  const deadline = Date.now() + timeoutMs
  let last: OrderDetail | null = null
  while (Date.now() < deadline) {
    last = await getOrder(token, orderId)
    if (last.status === expectedStatus) return last
    await new Promise(r => setTimeout(r, intervalMs))
  }
  throw new Error(
    `waitForOrderStatus timed out: order ${orderId} is "${last?.status}", expected "${expectedStatus}"`,
  )
}
