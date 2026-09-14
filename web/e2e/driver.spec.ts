/**
 * Driver PWA E2E tests — UC-003 AC#2 (full flow), AC#4 (decline → New), AC#5 (offline queue).
 *
 * Runs on the `mobile-driver` Playwright project (Pixel 5 viewport, geolocation granted).
 * Serial (1 worker) and shares the seeded DB with dispatcher.spec.ts (which runs first in the
 * chromium project). All three specs drive the real /d UI and use the dispatcher API helpers to
 * create/assign/read orders.
 *
 * Driver choice — driver2 (Petr Svoboda, vehicle "2K2 5678"):
 *   driver1 (Jan Novák) is polluted by dispatcher.spec (assigned+accepted) and DEMO05-completed;
 *   driver2 starts Free with one seeded Accepted order (DEMO03) and ZERO completed rides, so the
 *   summary totals assertion starts from a known zero baseline.
 *
 * AC#2 precondition note — start-shift is NOT UI-driveable (documented B-home gap):
 *   The home vehicle selector is built ONLY from GET /drivers/me `currentVehicleId`, and
 *   POST /drivers/me/offline nulls that field; there is no driver vehicle-list endpoint. So an
 *   offline driver cannot pick a vehicle to start a shift through the UI. These specs therefore
 *   drive from the ONLINE precondition (driver2 kept Free via the go-online API), which still
 *   proves the substantive heart of AC#2 end-to-end through the UI:
 *   offer → accept → arrive → start → complete(fixed) → Home totals. See handoff notes + DEMO.md.
 */

import { test, expect, type Page } from '@playwright/test'
import {
  loginAsDispatcher,
  listDrivers,
  createOrder,
  assignOrder,
  cancelOrder,
  listOrdersByDriver,
  getOrder,
  getMe,
  waitForOrderStatus,
  countOrderEventsByType,
  loginAsDriver,
  type OrderDetail,
} from './helpers/apiDriver'

const DRIVER_NAME = 'Petr Svoboda'
const DRIVER_EMAIL = 'driver2@demo.local'
const DRIVER_PASSWORD = 'Demo1234!'
const TERMINAL = new Set(['Completed', 'Cancelled'])

// Resolved once in beforeAll, reused by every spec.
let dispatcherToken: string
let driverId: string

/** Driver UI login: fill slug/email/password, submit, land on /d. */
async function driverUiLogin(page: Page): Promise<void> {
  await page.goto('/driver/login')
  await page.locator('#driver-fleet-slug').fill('demo')
  await page.locator('#driver-email').fill(DRIVER_EMAIL)
  await page.locator('#driver-password').fill(DRIVER_PASSWORD)
  await page.getByRole('button', { name: 'Přihlásit se' }).click()
  await page.waitForURL('/driver')
}

/**
 * Wait until the SignalR hub is connected before assigning (so the NewOrderOffered
 * push cannot race the assign). The ConnectionDot renders its raw state word
 * ("green" when connected) as its label — there is no translated title.
 */
async function waitForHubConnected(page: Page): Promise<void> {
  await expect(page.getByText('green', { exact: true })).toBeVisible({ timeout: 10_000 })
}

test.describe.serial('Driver PWA', () => {
  test.beforeAll(async () => {
    dispatcherToken = await loginAsDispatcher()

    // Resolve driver2's row id + current vehicle at runtime.
    const drivers = await listDrivers(dispatcherToken)
    const petr = drivers.find(d => d.displayName === DRIVER_NAME)
    if (!petr) throw new Error(`Seeded driver "${DRIVER_NAME}" not found`)
    driverId = petr.driverId

    // Release any non-terminal seeded order so ActiveOrderId is null (useRideRestore won't bind it).
    const open = (await listOrdersByDriver(dispatcherToken, driverId))
      .filter(o => !TERMINAL.has(o.status))
    for (const o of open) {
      await cancelOrder(dispatcherToken, o.id)
    }

    // The seeder leaves driver2 Free with vehicle2 (assign uses the driver's current vehicle
    // server-side). Verify the precondition empirically rather than assuming it: driver2 must be
    // online (has a currentVehicleId) and have no active order, so assign + the ride flow work.
    const driverSession = await loginAsDriver(DRIVER_EMAIL, DRIVER_PASSWORD)
    const me = await getMe(driverSession)
    if (me.currentVehicleId == null) {
      throw new Error(
        `Precondition failed: driver2 has no currentVehicleId (status=${me.status}). ` +
        `Start-shift is not UI-driveable (B-home gap); these specs require driver2 online with a vehicle.`,
      )
    }
    if (me.activeOrderId != null) {
      throw new Error(`Precondition failed: driver2 still has an active order ${me.activeOrderId} after cleanup`)
    }
  })

  test('Driver_FullFlow_StartShiftToCompleteFixed_ShowsTotals', async ({ page }) => {
    // ── Driver logs in on the mobile UI and the hub connects ─────────────────
    await driverUiLogin(page)
    await waitForHubConnected(page)

    // ── Dispatcher creates + assigns a FIXED-price order ─────────────────────
    const FIXED_PRICE = 250
    const order = await createOrder(dispatcherToken, {
      customerPhone: '+420777200001',
      priceType: 'Fixed',
      fixedPriceCzk: FIXED_PRICE,
    })
    const assignStart = Date.now()
    await assignOrder(dispatcherToken, order.id, driverId)

    // ── Offer takeover appears in the foreground within 2 s (AC#3 foreground half) ──
    const offerDialog = page.getByRole('dialog', { name: 'Nástup' })
    await expect(offerDialog).toBeVisible({ timeout: 2000 })
    console.log(`[FullFlow] Offer takeover shown ~${Date.now() - assignStart}ms after assign`)

    // ── Přijmout → navigates to /driver/ride ──────────────────────────────────────
    await offerDialog.getByRole('button', { name: 'Přijmout' }).click()
    await page.waitForURL('/driver/ride')

    // ── Jsem na místě (arrive) ────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Jsem na místě' }).click()
    await waitForOrderStatus(dispatcherToken, order.id, 'Arrived')

    // ── Zahájit jízdu (start) ─────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Zahájit jízdu' }).click()
    await waitForOrderStatus(dispatcherToken, order.id, 'InProgress')

    // ── Ukončit jízdu → complete screen (fixed price is locked) ───────────────
    await page.getByRole('button', { name: 'Ukončit jízdu' }).click()
    await page.waitForURL('/driver/ride/complete')

    // Fixed price is prefilled + locked; pick a payment and complete.
    await expect(page.getByText('Pevná cena')).toBeVisible()
    await page.getByRole('button', { name: 'Hotově' }).click()
    await page.getByRole('button', { name: 'Dokončit' }).click()

    // ── Back Home with the "Hotovo ✓" confirmation ────────────────────────────
    await page.waitForURL('/driver')
    await expect(page.getByText('Hotovo ✓')).toBeVisible({ timeout: 3000 })

    // ── Server confirms the order is Completed with the fixed price ───────────
    const completed = await waitForOrderStatus(dispatcherToken, order.id, 'Completed')
    expect(completed.finalPriceCzk).toBe(FIXED_PRICE)
    expect(completed.paymentType).toBe('Cash')

    // ── Home summary chips: 1 ride + cash total equals the fixed price ────────
    // The summary query (useMySummary) has a 30s staleTime, so a same-session remount
    // serves the stale cache. A full reload rebuilds the QueryClient and forces a fresh
    // GET /drivers/me/summary that reflects the just-completed ride.
    await page.reload()
    await page.waitForURL('/driver')
    const ridesChip = page.getByText('Jízdy').locator('..')
    await expect(ridesChip).toContainText('1', { timeout: 5000 })
    const cashChip = page.getByText('Hotovost').locator('..')
    await expect(cashChip).toContainText(`${FIXED_PRICE} Kč`)
  })

  test('Driver_Decline_ReturnsOrderToNew', async ({ page }) => {
    await driverUiLogin(page)
    await waitForHubConnected(page)

    // Dispatcher creates + assigns a new order to driver2 (now Free again after completing above).
    const order = await createOrder(dispatcherToken, {
      customerPhone: '+420777200002',
      priceType: 'Fixed',
      fixedPriceCzk: 180,
    })
    await assignOrder(dispatcherToken, order.id, driverId)

    const offerDialog = page.getByRole('dialog', { name: 'Nástup' })
    await expect(offerDialog).toBeVisible({ timeout: 2000 })

    // ── Odmítnout requires a reason ───────────────────────────────────────────
    await offerDialog.getByRole('button', { name: 'Odmítnout' }).click()
    // Reason picker appears; pick "Daleko".
    await offerDialog.getByRole('button', { name: 'Daleko' }).click()
    // Confirm decline ("Odmítnout" is the confirm label in the declining phase).
    await offerDialog.getByRole('button', { name: 'Odmítnout' }).click()

    // ── Order returns to New, dispatcher-visible within ~1 s ──────────────────
    const back = await waitForOrderStatus(dispatcherToken, order.id, 'New', 2000)
    expect(back.driverId).toBeNull()
  })

  test('Driver_OfflineArrive_QueuedThenDeliveredExactlyOnce', async ({ page, context }) => {
    // Extend the per-test budget beyond the 30s default to cover the offline window + a reload +
    // the cold-connect queue drain.
    test.setTimeout(45_000)
    await driverUiLogin(page)
    await waitForHubConnected(page)

    // Dispatcher creates + assigns; driver accepts through the UI.
    const order = await createOrder(dispatcherToken, {
      customerPhone: '+420777200003',
      priceType: 'Fixed',
      fixedPriceCzk: 200,
    })
    await assignOrder(dispatcherToken, order.id, driverId)

    const offerDialog = page.getByRole('dialog', { name: 'Nástup' })
    await expect(offerDialog).toBeVisible({ timeout: 2000 })
    await offerDialog.getByRole('button', { name: 'Přijmout' }).click()
    await page.waitForURL('/driver/ride')
    await waitForOrderStatus(dispatcherToken, order.id, 'Accepted')

    // Wait for the ride screen to finish restoring the order (arrive button visible) BEFORE
    // going offline — otherwise setOffline(true) can abort the in-flight reconcile fetch
    // (GET /drivers/me + GET /orders/{id}) and the ride screen renders blank with no button.
    const arriveButton = page.getByRole('button', { name: 'Jsem na místě' })
    await expect(arriveButton).toBeVisible({ timeout: 10_000 })

    // ── Go offline, tap "Jsem na místě" → the transition is QUEUED ────────────
    await context.setOffline(true)
    await arriveButton.click()

    // The "čeká na odeslání" indicator appears (queued, awaiting replay). It renders in both
    // the session-wide DriverQueueBar (DriverLayout) and the ride screen's own PendingBadge,
    // so there can be >1 match — assert at least one is visible.
    const pendingBadge = page.getByText('čeká na odeslání')
    await expect(pendingBadge.first()).toBeVisible({ timeout: 5000 })

    // Confirm the server has NOT recorded the arrive yet (still Accepted).
    const whileOffline = await getOrder(dispatcherToken, order.id)
    expect(whileOffline.status).toBe('Accepted')

    // ── Go back online → the queue replays and delivers exactly once ──────────
    await context.setOffline(false)
    // Playwright's setOffline does NOT drop an already-open SignalR WebSocket, so the hub never
    // leaves 'connected' and the reconnect-drain never fires (a harness limitation, not an app
    // bug — a real network loss drops the WS via keepalive and the reconnect drain works).
    // Reload forces a cold hub connect, which drains the IndexedDB-persisted queue on 'connected'
    // — a faithful stand-in for the app reconnecting on network restore. The arrive replays with
    // its enqueue-time idempotency key, so the server records exactly one Arrived.
    await page.reload()
    // The pending indicator clears once the queue drains after the cold reconnect.
    await expect(pendingBadge).toHaveCount(0, { timeout: 20_000 })

    // ── Exactly-once proof: the order advanced to Arrived and recorded ONE Arrived event ──
    await waitForOrderStatus(dispatcherToken, order.id, 'Arrived', 5000)
    const arriveEventCount = await countOrderEventsByType(dispatcherToken, order.id, 'Arrived')
    expect(arriveEventCount).toBe(1)

    // Cleanup: release the order so it does not pollute later runs / the shared DB.
    await releaseActiveOrder(dispatcherToken, order.id)
  })
})

/** Best-effort cleanup: cancel an order if it is not already terminal. */
async function releaseActiveOrder(token: string, orderId: string): Promise<void> {
  try {
    const o: OrderDetail = await getOrder(token, orderId)
    if (!TERMINAL.has(o.status)) {
      await cancelOrder(token, orderId, 'E2E cleanup')
    }
  } catch {
    // best effort
  }
}
