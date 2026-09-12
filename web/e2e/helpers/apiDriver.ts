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
