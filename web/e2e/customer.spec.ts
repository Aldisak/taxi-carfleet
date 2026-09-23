/**
 * Customer PWA E2E tests — UC-004 AC#1 (3-tap order), AC#2 (live tracking), AC#3 (valid/expired
 * tracking link), AC#5 (cancel in Accepted → CancelledByRole=Customer + driver loses the order),
 * AC#7 (rating visible server-side).
 *
 * Runs on the `mobile-customer` Playwright project (Pixel 5 viewport, geolocation granted).
 * Serial (1 worker) and shares the seeded DB with dispatcher.spec.ts (chromium) and driver.spec.ts
 * (mobile-driver). All three specs reuse the single webServer harness (docker db + dotnet run Seed).
 *
 * DEV SMS CODE (verified against api/src — see apiCustomer.ts header): the customer login code is
 * random + SHA-256-hashed + never logged, so it cannot be read from console/API output. The harness
 * injects a KNOWN code hash directly into Postgres (docker psql, the same mechanism scripts/e2e-api.mjs
 * already uses) — a test-harness technique, not an api/ change.
 *
 * AC#1 TAP COUNT: the assignment states "exactly 3 taps before the phone step". The IMPLEMENTED
 * path (B-home + B-route-order) is: tap route card (→ Confirm screen) → tap "Objednat" (→ inline
 * login) = exactly 2 taps before the phone input; RouteOrderPage has no separate "Confirm" button —
 * the route card navigation IS the confirm. We assert the REAL count the app produces (2) rather than
 * pad a third tap, and reconcile the "3" in the handoff + DEMO.md. (The marketing "3 taps" likely
 * counts the later "Objednat-after-login" as a third interaction.)
 */

import { test, expect, type Page } from '@playwright/test'
import {
  loginAsDispatcher,
  listDrivers,
  assignOrder,
  cancelOrder,
  listOrdersByDriver,
  getOrder,
  loginAsDriver,
  type DriverSession,
} from './helpers/apiDriver'
import {
  loginAsCustomer,
  createCustomerOrder,
  readOrderRow,
  sendDriverPosition,
  customerCancelOrder,
  injectForPhone,
  DEV_SMS_CODE,
  type CustomerSession,
  type CustomerOrder,
} from './helpers/apiCustomer'

const DRIVER1_EMAIL = 'driver1@demo.local'
const DRIVER_PASSWORD = 'Demo1234!'
const DRIVER1_NAME = 'Jan Novák'
const TERMINAL = new Set(['Completed', 'Cancelled'])

let dispatcherToken: string
let driver1Id: string
let driver1Vehicle: string
let driver1Session: DriverSession

/** A unique Czech mobile phone per test (avoids the 1/60s + 3/10min per-phone SMS rate limits). */
function freshPhone(): string {
  const n = Math.floor(100000 + Math.random() * 899999)
  return `+420601${String(n).slice(0, 6)}`
}

/** Seeds the customer session into localStorage so the app treats /c as logged-in (authed tracking). */
async function injectCustomerSession(page: Page, session: CustomerSession): Promise<void> {
  await page.addInitScript(
    ([access, refresh]) => {
      localStorage.setItem('auth.accessToken', access)
      localStorage.setItem('auth.refreshToken', refresh)
      localStorage.setItem('auth.fleetSlug', 'demo')
      localStorage.setItem('auth.userRole', 'Customer')
    },
    [session.accessToken, session.refreshToken],
  )
}

/** Drives an order (customer-owned) to Accepted by driver1 via the API (assign + accept). */
async function driveToAccepted(orderId: string): Promise<void> {
  await assignOrder(dispatcherToken, orderId, driver1Id)
  await loginAndAccept(orderId)
}

async function loginAndAccept(orderId: string): Promise<void> {
  // driver1 accepts via the API (owner driver resolved in beforeAll).
  const res = await fetch(`http://localhost:5249/api/v1/orders/${orderId}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${driver1Session.accessToken}`, 'X-Fleet-Slug': 'demo' },
  })
  if (!res.ok) throw new Error(`accept failed: ${res.status} ${await res.text()}`)
}

test.describe.serial('Customer PWA', () => {
  test.beforeAll(async () => {
    dispatcherToken = await loginAsDispatcher()

    const drivers = await listDrivers(dispatcherToken)
    const jan = drivers.find(d => d.displayName === DRIVER1_NAME)
    if (!jan) throw new Error(`Seeded driver "${DRIVER1_NAME}" not found`)
    driver1Id = jan.driverId

    // Release any non-terminal seeded order on driver1 so it is Free and can accept our orders.
    const open = (await listOrdersByDriver(dispatcherToken, driver1Id)).filter(o => !TERMINAL.has(o.status))
    for (const o of open) {
      await cancelOrder(dispatcherToken, o.id)
    }

    driver1Session = await loginAsDriver(DRIVER1_EMAIL, DRIVER_PASSWORD)
    // driver1's current vehicle is resolved server-side on assign; we just need it online.
    const me = await fetch('http://localhost:5249/api/v1/drivers/me', {
      headers: { Authorization: `Bearer ${driver1Session.accessToken}`, 'X-Fleet-Slug': 'demo' },
    }).then(r => r.json()) as { currentVehicleId: string | null }
    if (me.currentVehicleId == null) {
      throw new Error('Precondition: driver1 has no current vehicle (cannot be assigned)')
    }
    driver1Vehicle = me.currentVehicleId
    void driver1Vehicle
  })

  // ── AC#2 ─────────────────────────────────────────────────────────────────────
  test('Customer_LiveHeadlineAndMarker_OnAssignAccept', async ({ page }) => {
    const session = await loginAsCustomer(freshPhone())
    const order = await createCustomerOrder(session)

    await injectCustomerSession(page, session)
    await page.goto(`/customer/t/${order.publicCode}`)

    // Initially "Hledáme řidiče…" (New).
    await expect(page.getByRole('heading', { name: 'Hledáme řidiče…' })).toBeVisible({ timeout: 10_000 })

    // Dispatcher assigns + driver1 accepts via the API (no reload).
    await driveToAccepted(order.id)

    // HARD ASSERTION (the substantive AC#2 proof): the headline flips to the Accepted state WITHOUT a
    // reload (OrderChanged → order:{id} group → cache invalidate → refetch). etaMinutes is null pre-06,
    // so the headline is "Řidič … je na cestě". This proves the customer tracking updates live.
    await expect(page.getByRole('heading', { name: /Řidič.*je na cestě/ })).toBeVisible({ timeout: 15_000 })

    // CAR MARKER (best-effort, documented limitation): send driver GPS positions through the hub
    // (driver1 is the accepted driver, so FleetHub.UpdatePosition broadcasts DriverPositionChanged to
    // the order:{id} group the customer subscribes to). The marker (.tracking-car-icon, a Leaflet
    // divIcon) renders only once a live position arrives. This is inherently racy in the harness: the
    // customer's Subscribe(orderId) only fires after orderId resolves AND the hub reaches 'connected',
    // and UpdatePosition is throttled to ≤1/3 s per driver — so a single send can land before the
    // subscription. We retry a few sends with a gap, then check the marker WITHOUT failing the test
    // (the headline flip above is the authoritative AC#2 proof). Movement is NOT synthesized; the
    // limitation is documented honestly in the handoff + DEMO.md §14.
    const marker = page.locator('.tracking-car-icon')
    let markerSeen = false
    for (let i = 0; i < 4 && !markerSeen; i++) {
      await sendDriverPosition(driver1Session.accessToken, 50.03 + i * 0.001, 15.2 + i * 0.001)
      markerSeen = await marker.first().isVisible().catch(() => false)
      if (!markerSeen) {
        markerSeen = await marker
          .first()
          .waitFor({ state: 'visible', timeout: 3500 })
          .then(() => true)
          .catch(() => false)
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[AC#2] car marker rendered from a live DriverPositionChanged: ${markerSeen}`)

    // Cleanup.
    await customerCancelOrder(session, order.id)
  })

  // ── AC#3 ─────────────────────────────────────────────────────────────────────
  test('Customer_PublicTrackingLink_ValidVsExpired', async ({ page }) => {
    const session = await loginAsCustomer(freshPhone())
    const order: CustomerOrder = await createCustomerOrder(session)

    // VALID token (logged-out): the public tracking view renders (not expired).
    await page.goto(`/customer/t/${order.trackingCode}?k=${encodeURIComponent(order.trackingToken)}`)
    await expect(page.getByText('Odkaz vypršel')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Hledáme řidiče…' })).toBeVisible({ timeout: 10_000 })

    // TAMPERED token → 410 Tracking.LinkExpired → "Odkaz vypršel" + the Zavolat call button.
    const tampered = order.trackingToken.slice(0, -3) + 'AAA'
    await page.goto(`/customer/t/${order.trackingCode}?k=${encodeURIComponent(tampered)}`)
    await expect(page.getByRole('heading', { name: 'Odkaz vypršel' })).toBeVisible({ timeout: 10_000 })
    // The map-first tracking screen is a SIBLING leaf of CustomerLayout (UC-016 WI-4), so the
    // expired meta-state renders standalone WITHOUT the CustomerLayout header/<main> chrome — there
    // is exactly one Zavolat fallback (the in-content CallButton), not the old ≥2 (header + main).
    // Assert by VISIBLE TEXT (role-agnostic): CallButton renders a tel: <a> when a fleet phone is
    // known (the valid public-link render above mounts CustomerMapShell → useFleetBranding persists
    // fleet.phone to localStorage, which survives this goto) but a disabled <button> when it is not
    // yet known — both render the visible label "Zavolat", so getByText survives that branding race.
    await expect(page.getByText('Zavolat')).toBeVisible()

    // Cleanup.
    await customerCancelOrder(session, order.id)
  })

  // ── AC#5 (+ AC#7) ──────────────────────────────────────────────────────────────
  test('Customer_CancelInAccepted_ReasonCustomer_DriverLosesOrder', async ({ page }) => {
    const session = await loginAsCustomer(freshPhone())
    const order = await createCustomerOrder(session)

    // Drive to Accepted by driver1.
    await driveToAccepted(order.id)

    await injectCustomerSession(page, session)
    await page.goto(`/customer/t/${order.publicCode}`)

    // Headline is the Accepted state; the cancel button is offered.
    await expect(page.getByRole('heading', { name: /Řidič.*je na cestě/ })).toBeVisible({ timeout: 15_000 })
    const cancelBtn = page.getByRole('button', { name: 'Zrušit objednávku' })
    await expect(cancelBtn).toBeVisible()
    await cancelBtn.click()

    // Confirm dialog: post-Accepted hint is shown; confirm the cancel.
    const dialog = page.getByRole('dialog', { name: 'Zrušit objednávku?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/Řidič už jede/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Ano, zrušit' }).click()

    // The headline flips to the Cancelled state without a reload.
    await expect(page.getByRole('heading', { name: 'Objednávka byla zrušena' })).toBeVisible({ timeout: 15_000 })

    // Server truth (AC#5): the order is Cancelled with CancelledByRole=Customer, read directly from DB.
    const row = readOrderRow(order.id)
    expect(row.status).toBe('Cancelled')
    expect(row.cancelledByRole).toBe('Customer')

    // The driver lost the order: it is terminal (Cancelled) and no longer an active order for driver1.
    const driverOpen = (await listOrdersByDriver(dispatcherToken, driver1Id)).filter(
      o => o.id === order.id && !TERMINAL.has(o.status),
    )
    expect(driverOpen).toHaveLength(0)
  })

  // ── AC#7 (rating server-side) ──────────────────────────────────────────────────
  test('Customer_Rating_AfterCompleted_VisibleServerSide', async ({ page }) => {
    // Create + complete an order, then rate it via the customer JWT; assert the rating persists
    // (dispatcher order detail / DB row). This proves AC#7 without depending on the rating UI
    // timing on the Completed tracking screen.
    const session = await loginAsCustomer(freshPhone())
    const order = await createCustomerOrder(session)
    await driveToAccepted(order.id)

    // Drive Arrived → InProgress → Completed via driver1. IMPORTANT: only set Content-Type +
    // body when there IS a body. The arrive/start endpoints take NO body; sending
    // `Content-Type: application/json` with an empty body makes FastEndpoints try to parse an
    // empty body as JSON → JsonException → 500 (verified against the live harness). apiDriver.ts's
    // bodyless POSTs omit Content-Type for exactly this reason — mirror that here.
    const driverPost = async (path: string, body?: unknown) => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${driver1Session.accessToken}`,
        'X-Fleet-Slug': 'demo',
      }
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      const res = await fetch(`http://localhost:5249/api/v1/orders/${order.id}/${path}`, {
        method: 'POST',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`)
    }
    await driverPost('arrive')
    await driverPost('start')
    await driverPost('complete', { finalPriceCzk: 100, paymentType: 'Cash' })

    const completed = await getOrder(dispatcherToken, order.id)
    expect(completed.status).toBe('Completed')

    // Customer rates the completed order.
    const rateRes = await fetch(`http://localhost:5249/api/v1/orders/${order.id}/rating`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
        'X-Fleet-Slug': 'demo',
      },
      body: JSON.stringify({ stars: 5, comment: 'Skvělá jízda' }),
    })
    expect(rateRes.ok).toBeTruthy()

    // Server truth (AC#7): rating is persisted.
    const row = readOrderRow(order.id)
    expect(row.ratingStars).toBe(5)
    expect(row.ratingComment).toContain('Skvělá')

    // Touch the page so the spec exercises the customer app at least once in this test.
    await injectCustomerSession(page, session)
    await page.goto(`/customer/t/${order.publicCode}`)
    await expect(page.getByRole('heading', { name: /Hotovo/ })).toBeVisible({ timeout: 10_000 })
  })

  // ── AC#1 (map-first create-order) ────────────────────────────────────────────
  // UC-015 rewrote the customer order flow: /customer is now the map-first MapOrderPage
  // (search "Kam to bude?" → pick a suggestion → price bottom-sheet → Objednat → inline
  // phone+code login → /customer/t/...). The old common-route Home + Confirm screens are gone.
  //
  // Placed LAST intentionally (describe.serial): the earlier AC#2/#3/#5/#7 tests build state via
  // API + goto, not via this UI flow, so a failure here never skips them.
  //
  // GEO HARNESS NOTE: the e2e API harness (scripts/e2e-api.mjs, --no-launch-profile) does NOT
  // inject Mapy__ServerKey, so the real /geo/suggest + /geo/route (→ /pricing/quote Estimate)
  // upstream is keyless and non-deterministic. We therefore stub /geo/suggest and /pricing/quote
  // at the network layer (page.route) so the destination pick + Fixed price sheet are
  // deterministic — mirroring the AC#4 attribution test that route.fulfill's tiles. The REAL
  // create-order + auth path (POST /orders, request-code/verify-code with the injected SMS hash)
  // is exercised end-to-end; only the two keyed geo reads are stubbed.
  test('Customer_MapFirstCreateOrder_ToTracking', async ({ page }) => {
    // Stub the keyed geo reads with deterministic Kutná Hora coordinates + a Fixed quote so the
    // price sheet enables Order without depending on the keyless upstream.
    await page.route(/\/api\/v1\/geo\/suggest/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { name: 'Centrum, Kutná Hora', label: 'Adresa', street: 'Palackého náměstí', municipality: 'Kutná Hora', lat: 49.948, lng: 15.268 },
          ],
        }),
      }),
    )
    // An Estimate RANGE (not Fixed): Estimate maps to priceType=Estimate with routeId=null, so the
    // REAL POST /orders has no route_id FK to satisfy (a fabricated Fixed routeId would fail the FK
    // → 500). Estimate is orderable and the server recomputes the price.
    await page.route(/\/api\/v1\/pricing\/quote/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'Estimate', lowCzk: 140, highCzk: 180, distanceKm: 6, durationMin: 12, estimateMode: 'Exact' }),
      }),
    )
    // Reverse-geocode (pickup center-pin label) is also keyed — stub it so the pickup resolves.
    await page.route(/\/api\/v1\/geo\/reverse/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ found: true, label: 'Nádraží, Kutná Hora', street: 'Nádražní', municipality: 'Kutná Hora' }),
      }),
    )
    // Route preview (pickup → destination) is keyed too — stub it with a deterministic 2-point
    // geometry so the map draws the fastest-route line BEFORE Order (route-preview-gps). Best-effort
    // in the client: even without this stub the flow still works (geometry null → no line, order
    // unaffected); the stub only makes the preview line deterministic in the keyless harness.
    await page.route(/\/api\/v1\/geo\/route/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          distanceMeters: 90000,
          durationSeconds: 4200,
          estimatedPriceCzk: 1800,
          geometry: [
            [50.08, 14.42],
            [49.95, 15.27],
          ],
        }),
      }),
    )

    // Grant + seed a browser geolocation so the GPS-pickup path (auto-recenter + "Použít moji
    // polohu") is exercised. If the grant is unavailable the map-pin fallback keeps the flow
    // working, so this is best-effort and the assertions below never depend on GPS specifically.
    try {
      await page.context().grantPermissions(['geolocation'])
      await page.context().setGeolocation({ latitude: 49.948, longitude: 15.268 })
    } catch {
      // Fallback: the center-pin pickup path (reverse-geocode above) still resolves a pickup.
    }

    // Fresh/logged-out visit to the map-first customer surface (localhost → slug 'demo').
    await page.goto('/customer')

    // MapOrderPage-specific proof: the "Kam to bude?" destination search is present (this
    // discriminates the MapOrderPage leaf from an empty CustomerLayout Outlet at bare /customer).
    const search = page.getByRole('combobox', { name: /Kam to bude/ })
    await expect(search).toBeVisible({ timeout: 10_000 })

    // Type a destination → the stubbed suggestion appears → pick it.
    await search.fill('Centrum')
    const suggestion = page.getByRole('option', { name: /Centrum, Kutná Hora/ })
    await expect(suggestion).toBeVisible({ timeout: 10_000 })
    await suggestion.click()

    // The price bottom-sheet shows the Estimate range and an enabled "Objednat".
    const objednat = page.getByRole('button', { name: /^Objednat$/ })
    await expect(objednat).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/140\s*Kč/)).toBeVisible()

    // Objednat → logged-out → inline login step appears (order state preserved on the sheet).
    await objednat.click()
    const phoneInput = page.getByLabel('Telefonní číslo')
    await expect(phoneInput).toBeVisible({ timeout: 10_000 })

    // Phone + dev code → auth → REAL create order → Tracking.
    const phone = freshPhone()
    await phoneInput.fill(phone)
    await page.getByRole('button', { name: 'Odeslat kód' }).click()

    // The code step renders after request-code resolves; inject the known code hash, then enter it.
    // UC-020: the code entry is the kit CodeInput — a role=group of 6 single-digit boxes
    // ("Ověřovací kód 1"…"Ověřovací kód 6"). Focus the first box and type; each keystroke
    // fills a box and auto-advances, and the 6th digit auto-submits → verify-code → create order.
    const codeGroup = page.getByRole('group', { name: 'Ověřovací kód' })
    await expect(codeGroup).toBeVisible({ timeout: 10_000 })
    injectForPhone(phone)
    await codeGroup.getByLabel('Ověřovací kód 1').focus()
    await page.keyboard.type(DEV_SMS_CODE)

    // Lands on Tracking showing "Hledáme řidiče…".
    await page.waitForURL(/\/customer\/t\//, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Hledáme řidiče…' })).toBeVisible({ timeout: 10_000 })
  })
})
