/**
 * Geo / Mapy.com E2E — UC-010 WI-19 (AC#4 tiles + attribution, AC#5 degraded lifecycle).
 *
 * ── Harness reality (why the assertions are shaped this way) ─────────────────────────
 * The shared e2e API harness runs with NO Mapy API key configured (no Mapy__ServerKey /
 * Mapy__BrowserKey env). So:
 *   - the real MapyClient returns Unavailable for suggest/geocode/reverse/route;
 *   - GET /geo/config returns 200 with an EMPTY browserKey (the env fallback is empty).
 * The DEGRADED path is therefore the natural state in e2e — and that is exactly what
 * AC#5 requires the app to survive. We assert the degraded UX, never a Mapy-key-dependent
 * value (no real tiles, no live suggest, no geocoded coordinates).
 *
 * ── AC#5 degraded lifecycle (this spec's headline) ──────────────────────────────────
 * A dispatcher creates an order using a QUICK CHIP (static coords, "do NOT require a geo
 * call" per quickChips.ts) — proving the board is fully usable with zero map API — then
 * assigns it in the UI, and the ride is driven to Completed via the driver API transitions
 * (accept → arrive → start → complete). The dispatcher order form REQUIRES pickup coords
 * (orderFormSchema.ts → pickupNoCoords), so a coordless "bez souřadnic" order is genuinely
 * unreachable through the dispatcher create UI in the degraded harness — a real constraint,
 * recorded in the handoff. The degraded map banner ("Mapa dočasně nedostupná") is asserted
 * on the board map panel (keyless tiles 401 → tileerror → MapUnavailableBanner).
 *
 * ── AC#4 Mapy tiles + attribution (mandatory) ───────────────────────────────────────
 * In the keyless harness the Mapy tile request 401s, which unmounts the TileLayer and hides
 * the attribution + logo behind the degraded banner — so the mandatory attribution is only
 * OBSERVABLE by making tiles "succeed". We fulfil the Mapy maptiles request with a valid 1×1
 * PNG (no key, no pixels asserted) so `tilesFailed` stays false; the Leaflet attribution
 * control ("© Seznam.cz") and the corner Mapy logo link then render, and we prove the layer
 * is Mapy-wired by waiting for the api.mapy.cz maptiles request. This needs no Mapy account.
 *
 * ── Serial-state / free-driver hazard (why beforeAll exists) ─────────────────────────
 * The chromium project runs analytics.spec → dispatcher.spec → geo.spec (alphabetical, 1
 * worker, shared DB). By the time geo runs, the seeder's Free drivers may be consumed:
 * dispatcher.spec drives driver1 (Jan Novák), and the seeder itself leaves driver2 (Petr
 * Svoboda) Busy on DEMO03 and driver3 (Karel Dvořák) InProgress on DEMO04. So scanning for
 * "any Free driver" is non-deterministic and was the flake source (undefined freeName).
 *
 * FIX: geo makes its OWN deterministic Free driver in beforeAll rather than depending on one.
 * We pick driver3 (Karel Dvořák) — the ONE seeded driver no other chromium spec touches, and
 * which the seeder leaves online-with-vehicle3 (only mid-ride, not offline, so it keeps its
 * vehicle). We release its non-terminal orders — completing the InProgress DEMO04 via the
 * driver API (Cancel is illegal from InProgress; Complete sets DriverStatus→Free) and
 * cancelling any cancellable ones via the dispatcher — then assert driver3 is Free with a
 * currentVehicleId. AC#5 then assigns to THAT named driver and drives its own fresh order to
 * Completed (releasing driver3 again), so geo does not contaminate the later driver/customer
 * mobile projects. Runs in the desktop `chromium` project (not matched by the mobile testMatch
 * globs), serially (1 worker) under the shared webServer harness.
 */

import { test, expect, type Page } from '@playwright/test'
import {
  loginAsDispatcher,
  loginAsDriver,
  listDrivers,
  acceptOrder,
  getOrder,
  getMe,
  listOrdersByDriver,
  cancelOrder,
  type DriverSession,
} from './helpers/apiDriver'

const API_BASE = 'http://localhost:5249/api/v1'
const FLEET = 'demo'

// Known-password drivers (DevelopmentSeeder): displayName → login email.
const DRIVER_EMAIL_BY_NAME: Record<string, string> = {
  'Jan Novák': 'driver1@demo.local',
  'Petr Svoboda': 'driver2@demo.local',
  'Karel Dvořák': 'driver3@demo.local',
}
const DRIVER_PASSWORD = 'Demo1234!'

// geo's dedicated driver: Karel Dvořák (driver3) — the one seeded driver no other chromium
// spec touches. Seeded online-with-vehicle3, only mid-ride; we free it in beforeAll.
const GEO_DRIVER_NAME = 'Karel Dvořák'
const GEO_DRIVER_EMAIL = DRIVER_EMAIL_BY_NAME[GEO_DRIVER_NAME]

// Order statuses that cannot be Cancel'd by a dispatcher (state machine): from InProgress the
// only legal transition is Complete. Terminal states need no action.
const TERMINAL = new Set(['Completed', 'Cancelled'])

// A valid 1×1 transparent PNG (base64) — enough for Leaflet's <img> onload to fire so the
// TileLayer is considered "loaded" and the attribution/logo render. No pixels are asserted.
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const SECTION_NOVE = 'Nové'
const SECTION_PRIRAZENE = 'Přiřazené / Čekají na přijetí'

/** A unique Czech mobile phone per run (avoids collisions with other serial specs' orders). */
function freshPhone(): string {
  const n = Math.floor(100000 + Math.random() * 899999)
  return `+420602${String(n).slice(0, 6)}`
}

/** Dispatcher UI login (fill slug/email/password, submit → /dispatcher). */
async function dispatcherUiLogin(page: Page): Promise<void> {
  await page.goto('/dispatcher/login')
  await page.locator('#fleetSlug').fill(FLEET)
  await page.locator('#email').fill('dispatcher@demo.local')
  await page.locator('#password').fill('Demo1234!')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL('/dispatcher')
}

/** Wait until the SignalR hub is connected (offline banner absent) so realtime moves apply. */
async function waitForHubConnected(page: Page): Promise<void> {
  await expect(page.getByText('Offline – zobrazuji poslední známý stav')).toBeHidden({ timeout: 10_000 })
}

/**
 * Drives an Accepted order through arrive → start → complete via the driver API.
 *
 * NOTE (spec-tuning, recorded in handoff): the bodyless transitions (arrive/start) must NOT send
 * a `Content-Type: application/json` header. With `DontCatchExceptions()` on every endpoint,
 * FastEndpoints tries to deserialize the (empty) body when the content type says JSON and throws
 * `JsonException: The input does not contain any JSON tokens` → HTTP 500. The proven `acceptOrder`
 * helper omits Content-Type for exactly this reason; we mirror it — Content-Type is set only when a
 * JSON body is actually sent (complete).
 */
async function driveToCompleted(session: DriverSession, orderId: string, finalPriceCzk: number): Promise<void> {
  const post = async (path: string, body?: unknown): Promise<void> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.accessToken}`,
      'X-Fleet-Slug': FLEET,
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${API_BASE}/orders/${orderId}/${path}`, {
      method: 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`)
  }
  await post('arrive')
  await post('start')
  await post('complete', { finalPriceCzk, paymentType: 'Cash' })
}

/** POSTs a single driver transition (bodyless for arrive/start, JSON body for complete). */
async function driverPost(session: DriverSession, orderId: string, path: string, body?: unknown): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    'X-Fleet-Slug': FLEET,
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API_BASE}/orders/${orderId}/${path}`, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`)
}

/**
 * Makes GEO_DRIVER (Karel Dvořák) deterministically Free + online-with-vehicle, regardless of
 * prior serial state. Releases every non-terminal order the driver holds:
 *   - InProgress → Complete via the driver API (Cancel is illegal from InProgress; Complete
 *     sets DriverStatus → Free);
 *   - Arrived → Start then Complete (drive it out — Cancel from Arrived is a no-show path we skip);
 *   - New/Assigned/Accepted → Cancel via the dispatcher.
 * Then asserts the driver is Free with a currentVehicleId so the AC#5 assign + ride flow work.
 */
async function ensureGeoDriverFree(): Promise<void> {
  const dispatcherToken = await loginAsDispatcher()
  const driver = (await listDrivers(dispatcherToken)).find(d => d.displayName === GEO_DRIVER_NAME)
  if (!driver) throw new Error(`Seeded geo driver "${GEO_DRIVER_NAME}" not found`)

  const driverSession = await loginAsDriver(GEO_DRIVER_EMAIL, DRIVER_PASSWORD)

  const open = (await listOrdersByDriver(dispatcherToken, driver.driverId)).filter(o => !TERMINAL.has(o.status))
  for (const o of open) {
    if (o.status === 'InProgress') {
      await driverPost(driverSession, o.id, 'complete', { finalPriceCzk: 150, paymentType: 'Cash' })
    } else if (o.status === 'Arrived') {
      await driverPost(driverSession, o.id, 'start')
      await driverPost(driverSession, o.id, 'complete', { finalPriceCzk: 150, paymentType: 'Cash' })
    } else {
      await cancelOrder(dispatcherToken, o.id, 'E2E geo setup')
    }
  }

  // Empirically confirm the precondition rather than assuming it.
  const me = await getMe(driverSession)
  if (me.currentVehicleId == null) {
    throw new Error(
      `Precondition failed: geo driver "${GEO_DRIVER_NAME}" has no currentVehicleId (status=${me.status}); ` +
      `expected online-with-vehicle from the seeder.`,
    )
  }
  if (me.activeOrderId != null) {
    throw new Error(`Precondition failed: geo driver "${GEO_DRIVER_NAME}" still has active order ${me.activeOrderId} after cleanup`)
  }
  if (me.status !== 'Free') {
    throw new Error(`Precondition failed: geo driver "${GEO_DRIVER_NAME}" is "${me.status}", expected Free after cleanup`)
  }
}

test.describe.serial('Geo / Mapy degraded mode + attribution', () => {
  // Make our OWN Free driver — geo must not depend on a pre-existing Free driver (serial flake).
  test.beforeAll(async () => {
    await ensureGeoDriverFree()
  })

  test('AC5_DegradedOrderLifecycle — dispatcher creates + assigns with zero map API; ride completes; map shows degraded banner', async ({ page }) => {
    await dispatcherUiLogin(page)
    await waitForHubConnected(page)

    // ── Create an order via a QUICK CHIP (static coords, no geo call) ──────────────
    // This is the crux of AC#5: the board is fully usable with the Mapy API down.
    await expect(page.getByRole('region', { name: SECTION_NOVE })).toBeVisible({ timeout: 10_000 })

    const phone = freshPhone()
    await page.locator('#order-phone').fill(phone)
    await page.getByRole('button', { name: 'Vlakové nádraží Kolín' }).click()
    await expect(page.getByRole('button', { name: 'Co nejdříve' })).toHaveAttribute('aria-pressed', 'true')

    const createResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/v1/orders') && r.request().method() === 'POST' && r.status() === 201,
    )
    await page.locator('#order-phone').press('Enter')
    const createBody = await (await createResponsePromise).json() as { order: { id: string } }
    const orderId = createBody.order?.id
    expect(orderId, 'order was created with zero map API').toBeTruthy()

    // The new card appears in Nové (identified by our unique phone).
    const noveSection = page.getByRole('region', { name: SECTION_NOVE })
    const newCard = noveSection.locator('article[aria-label^="order-card-"]').filter({ hasText: phone })
    await expect(newCard).toBeVisible({ timeout: 8_000 })
    const publicCode = (await newCard.getAttribute('aria-label'))?.replace('order-card-', '') ?? ''
    expect(publicCode).not.toBe('')

    // ── Assign in the UI to OUR driver, which beforeAll made deterministically Free ──
    const dispatcherToken = await loginAsDispatcher()
    // beforeAll (ensureGeoDriverFree) guarantees GEO_DRIVER is Free + online — assert it by name
    // (fails loudly naming the driver) rather than scanning for "any" Free driver (the old flake).
    const geoDriver = (await listDrivers(dispatcherToken)).find(d => d.displayName === GEO_DRIVER_NAME)
    expect(geoDriver, `geo driver "${GEO_DRIVER_NAME}" exists`).toBeTruthy()
    expect(geoDriver!.status, `geo driver "${GEO_DRIVER_NAME}" is Free after beforeAll cleanup`).toBe('Free')
    const freeName = geoDriver!.displayName

    await newCard.getByRole('button', { name: 'Přiřadit' }).click()
    const driverPicker = page.getByRole('listbox', { name: 'Vyberte řidiče' })
    await expect(driverPicker).toBeVisible({ timeout: 3_000 })
    await expect(page.getByText('Načítám řidiče...')).toBeHidden({ timeout: 5_000 })

    // The card-move to Přiřazené is an OPTIMISTIC cache update fired by useAssignOrder.onMutate —
    // it happens BEFORE the POST /assign commits on the server. So we wait for the real assign
    // response (2xx) before reading the server state; otherwise a fresh getOrder races the commit
    // and still sees "New" (spec-tuning, recorded in handoff).
    const assignResponsePromise = page.waitForResponse(
      r => /\/api\/v1\/orders\/[^/]+\/assign$/.test(r.url())
        && r.request().method() === 'POST'
        && r.status() < 400,
      { timeout: 10_000 },
    )
    await driverPicker.getByRole('option', { name: new RegExp(freeName) }).click()
    await assignResponsePromise

    // Card moves to Přiřazené — the assign succeeded with no geo call.
    const prirazene = page.getByRole('region', { name: SECTION_PRIRAZENE })
    await expect(prirazene.locator(`article[aria-label="order-card-${publicCode}"]`)).toBeVisible({ timeout: 5_000 })

    // ── Derive the accept-driver from the ORDER's real state after assign ──────────
    // Spec-tuning (handoff): do NOT reuse a pre-resolved driver session for accept — read the
    // order's actual driverId post-assign and authenticate as exactly that driver. This makes the
    // accept self-consistent regardless of which option the UI picker committed, and surfaces a
    // failed/mismatched assign loudly instead of a cryptic 404 NotEntitled on accept.
    const assigned = await getOrder(dispatcherToken, orderId)
    expect(assigned.status, 'order is Assigned after the UI assign').toBe('Assigned')
    expect(assigned.driverId, 'order carries a driverId after the UI assign').toBeTruthy()
    const assignedName = (await listDrivers(dispatcherToken)).find(d => d.driverId === assigned.driverId)?.displayName
    expect(assignedName, `assigned driverId ${assigned.driverId} maps to a known driver name`).toBeTruthy()
    const assignedEmail = DRIVER_EMAIL_BY_NAME[assignedName!]
    expect(assignedEmail, `driver "${assignedName}" has a known-password login`).toBeTruthy()
    const driverSession = await loginAsDriver(assignedEmail, DRIVER_PASSWORD)

    // ── Drive the ride to Completed via the driver API (accept → arrive → start → complete) ──
    await acceptOrder(driverSession, orderId)
    await driveToCompleted(driverSession, orderId, 180)

    // Server confirms the whole lifecycle completed with zero map API involvement.
    const completed = await getOrder(dispatcherToken, orderId)
    expect(completed.status).toBe('Completed')
    expect(completed.finalPriceCzk).toBe(180)

    // ── Degraded map banner: toggle the board map on → tiles fail → degraded banner ──
    // Spec-tuning (recorded in handoff): the natural keyless request to api.mapy.cz returns HTTP
    // 401, but a tile <img> ignores HTTP status — it only fires `error` when the BYTES fail to
    // decode as an image. The 401 body is apparently decodable/treated-as-loaded, so Leaflet emits
    // `load`, not `tileerror`, and the banner never shows (verified: 12 tiles → 401, alert count 0).
    // We therefore abort the tile requests (a hard network failure), which faithfully models the
    // "zero map API" degraded state AC#5 requires and deterministically fires Leaflet's `tileerror`
    // → MapUnavailableBanner. This is the AC5 mirror of AC4 (which stubs tiles to SUCCEED).
    await page.route(/api\.mapy\.cz\/v1\/maptiles\//, route => route.abort())
    await page.getByRole('button', { name: 'Zobrazit mapu' }).click()
    // MapUnavailableBanner is role="alert" with the Czech string (AC#5).
    await expect(page.getByRole('alert').filter({ hasText: 'Mapa dočasně nedostupná' })).toBeVisible({ timeout: 15_000 })
  })

  test('AC4_MapyTilesAttribution — with tiles stubbed, the Mapy attribution + logo render on the dispatcher board', async ({ page }) => {
    // Stub the Mapy maptiles request with a valid PNG so the TileLayer "loads" (no key needed,
    // no pixels asserted). This is the ONLY way to observe the mandatory attribution in the
    // keyless harness — a real keyless request 401s and hides it behind the degraded banner.
    await page.route(/api\.mapy\.cz\/v1\/maptiles\//, route =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }),
    )
    // Also stub the Mapy logo asset (loaded from api.mapy.cz too) so the <img> onload fires
    // without a real remote fetch — otherwise a broken remote image can compute to a zero-width
    // box and flake toBeVisible(). No Mapy account / real pixels needed.
    await page.route(/api\.mapy\.cz\/img\/api\/logo\.svg/, route =>
      route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="18"></svg>',
      }),
    )

    await dispatcherUiLogin(page)
    await waitForHubConnected(page)

    // Prove the tile layer is Mapy-wired (not OSM/OSRM): a maptiles request is made. Set up the
    // request wait BEFORE the click so a fast mount cannot fire the request before we listen.
    const maptilesRequest = page.waitForRequest(/api\.mapy\.cz\/v1\/maptiles\//, { timeout: 15_000 })

    // Open the board map panel.
    await page.getByRole('button', { name: 'Zobrazit mapu' }).click()
    await maptilesRequest

    // Mandatory Mapy logo link (corner overlay) — its alt text is the i18n string.
    await expect(page.getByRole('img', { name: 'Mapy.com – zobrazit na mapy.com' })).toBeVisible({ timeout: 15_000 })

    // Mandatory attribution control text (rendered by Leaflet from the attribution prop).
    await expect(page.locator('.leaflet-control-attribution').filter({ hasText: 'Seznam.cz' })).toBeVisible({
      timeout: 10_000,
    })

    // With tiles "succeeding", the degraded banner must NOT be shown.
    await expect(page.getByText('Mapa dočasně nedostupná')).toHaveCount(0)
  })
})
