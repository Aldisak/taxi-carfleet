/**
 * Tenant onboarding + runtime-branding E2E — UC-007 AC#3 and AC#4.
 *
 * AC#3 — a SuperAdmin creates a fleet via /admin → logs in as that fleet's FleetAdmin
 * (with the one-time password) → adds a driver → creates an order, end-to-end against a
 * SECOND fleet (its own slug), proving the system is multi-tenant without a rebuild.
 *
 * AC#4 — the second fleet's CUSTOMER app shows its OWN name + primary color + welcome,
 * resolved at runtime from GET /public/fleet, with NO per-tenant rebuild.
 *
 * ── Why ?fleet= instead of a real subdomain ──────────────────────────────────
 * Production resolves the tenant from the Host subdomain ({slug}.{domain} — see
 * docs/runbook.md). Locally there is no *.localhost wildcard DNS, so this spec drives the
 * second fleet via the app's existing `?fleet={slug}` slug override, which resolveFleetSlug
 * supports as the localhost fallback (subdomain → ?fleet= → /customer/f/{slug} → 'demo'). The
 * branding path exercised is identical; only the slug SOURCE differs.
 *
 * ── How the SuperAdmin is obtained (A7b — now unblocked) ──────────────────────
 * The DevelopmentSeeder seeds no SuperAdmin, so:
 *   1. beforeAll runs the `create-superadmin` CLI (A5) against the running harness DB to
 *      insert the fleetless SuperAdmin user (idempotent).
 *   2. The spec then authenticates that SuperAdmin via POST /auth/admin/login (A7b) — a
 *      fleetless { email, password } login returning a token with role=SuperAdmin and NO
 *      fleet_id claim. This is the SAME endpoint the /admin/login UI form posts to (AdminGuard
 *      redirects tokenless users there); driving the create-fleet step over the API with that
 *      token exercises the identical contract without a browser login. The FleetAdmin login
 *      below stays on the fleet-scoped POST /auth/staff/login (that is the correct path for a
 *      fleet-bound FleetAdmin).
 */

import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const API_BASE = 'http://localhost:5249/api/v1'

const SUPERADMIN_EMAIL = 'superadmin@demo.local'
const SUPERADMIN_PASSWORD = 'Super1234!'

// A deterministic second fleet. Slug must satisfy the server slug charset (a-z0-9-).
const NEW_FLEET = {
  slug: 'druha-flotila',
  name: 'Druhá Taxi Flotila',
  phone: '+420321999000',
  adminEmail: 'admin@druha.local',
  // A distinct brand color so AC#4 is provable against the base-theme demo fleet.
  colorHex: '#E91E63',
  welcomeText: 'Vítejte u druhé flotily',
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const API_PROJECT = path.join(REPO_ROOT, 'api', 'src', 'Taxi.Api')
const DOTNET = process.platform === 'win32'
  ? 'C:\\Users\\alesm\\AppData\\Local\\Microsoft\\dotnet\\dotnet.exe'
  : '/usr/local/bin/dotnet'

/** Runs the create-superadmin CLI against the harness DB. Idempotent (bootstrapper no-ops on dup). */
function ensureSuperAdmin(): void {
  // --no-build: the harness already built + is running the API; avoid a build lock.
  execSync(
    `"${DOTNET}" run --project "${API_PROJECT}" --no-build --no-launch-profile -- ` +
      `create-superadmin --email ${SUPERADMIN_EMAIL} --password ${SUPERADMIN_PASSWORD}`,
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        ASPNETCORE_ENVIRONMENT: 'Development',
        ConnectionStrings__Db:
          'Host=localhost;Port=5432;Database=taxi;Username=taxi;Password=taxi_dev_password',
        Seed__Enabled: 'false',
      },
    },
  )
}

/**
 * SuperAdmin login (A7b). Fleetless — POST /auth/admin/login with { email, password } only; no slug.
 * This is the same endpoint the /admin/login UI form posts to. Returns a role=SuperAdmin token.
 */
async function adminApiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error(`admin login failed for ${email}: ${res.status} ${await res.text()}`)
  }
  const body = (await res.json()) as { accessToken: string; user: { id: string; role: string } }
  return body.accessToken
}

/** Fleet-scoped staff login (FleetAdmin / Driver / Dispatcher). Requires a slug. */
async function apiLogin(email: string, password: string, fleetSlug: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fleetSlug, email, password }),
  })
  if (!res.ok) {
    throw new Error(`staff login failed for ${email}@${fleetSlug}: ${res.status} ${await res.text()}`)
  }
  const body = (await res.json()) as { accessToken: string; user: { id: string; role: string } }
  return body.accessToken
}

interface CreateFleetResult {
  fleetId: string
  slug: string
  adminEmail: string
  oneTimePassword: string
}

/**
 * SuperAdmin creates a fleet via the API. The /admin UI does the same POST with a token obtained
 * from the identical /auth/admin/login endpoint (A7b), so driving the create over the API
 * exercises the same contract.
 */
async function superAdminCreateFleet(token: string): Promise<CreateFleetResult> {
  const res = await fetch(`${API_BASE}/admin/fleets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      slug: NEW_FLEET.slug,
      name: NEW_FLEET.name,
      phone: NEW_FLEET.phone,
      adminEmail: NEW_FLEET.adminEmail,
    }),
  })
  if (res.status === 409) {
    throw new Error('fleet slug already exists — the harness DB was not reset before this run')
  }
  if (!res.ok) {
    throw new Error(`POST /admin/fleets failed: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as CreateFleetResult
}

const fleetHeaders = (token: string, slug: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
  'X-Fleet-Slug': slug,
})

/** FleetAdmin adds a Driver via POST /staff (the People tab's API). */
async function addDriver(token: string, slug: string): Promise<void> {
  const res = await fetch(`${API_BASE}/staff`, {
    method: 'POST',
    headers: fleetHeaders(token, slug),
    body: JSON.stringify({
      email: 'driver@druha.local',
      displayName: 'Nový Řidič',
      role: 'Driver',
      phone: '+420600900001',
    }),
  })
  if (!res.ok) {
    throw new Error(`add driver failed: ${res.status} ${await res.text()}`)
  }
}

/** FleetAdmin creates an order (DispatcherOrCustomer policy includes FleetAdmin). */
async function createOrder(token: string, slug: string): Promise<{ id: string; publicCode: string }> {
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: fleetHeaders(token, slug),
    body: JSON.stringify({
      pickupAddress: 'Náměstí, Druhé Město',
      pickupLat: 50.0281,
      pickupLng: 15.2006,
      dropoffAddress: 'Nádraží, Druhé Město',
      dropoffLat: 49.9481,
      dropoffLng: 15.2681,
      customerPhone: '+420777000111',
      customerName: 'E2E zákazník druhé flotily',
      passengers: 1,
      priceType: 'Fixed',
      fixedPriceCzk: 250,
    }),
  })
  if (!res.ok) {
    throw new Error(`create order failed: ${res.status} ${await res.text()}`)
  }
  const body = (await res.json()) as { order: { id: string; publicCode: string } }
  return body.order
}

/** FleetAdmin sets the new fleet's brand color + welcome so AC#4 has something distinct to assert. */
async function brandFleet(token: string, slug: string): Promise<void> {
  const res = await fetch(`${API_BASE}/fleet/settings`, {
    method: 'PUT',
    headers: fleetHeaders(token, slug),
    body: JSON.stringify({
      name: NEW_FLEET.name,
      phone: NEW_FLEET.phone,
      primaryColorHex: NEW_FLEET.colorHex,
      welcomeText: NEW_FLEET.welcomeText,
      offerTimeoutSeconds: 45,
      smsMonthlyCapCzk: 500,
      autoDispatchEnabled: false,
    }),
  })
  if (!res.ok) {
    throw new Error(`brand fleet failed: ${res.status} ${await res.text()}`)
  }
}

/** rgb(233, 30, 99) for #E91E63 — CSS computed-style form used by the assertion. */
const EXPECTED_RGB = 'rgb(233, 30, 99)'

test.describe.serial('Tenant onboarding + branding', () => {
  let adminToken: string

  test.beforeAll(() => {
    ensureSuperAdmin()
  })

  test('AC3_Onboarding — SuperAdmin creates a fleet; its FleetAdmin adds a driver and an order', async () => {
    // Fleetless SuperAdmin token via POST /auth/admin/login (A7b) — same endpoint the /admin/login UI uses.
    const superToken = await adminApiLogin(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)

    // SuperAdmin creates the second fleet (the ONE cross-tenant write). /admin UI does this POST.
    const created = await superAdminCreateFleet(superToken)
    expect(created.slug).toBe(NEW_FLEET.slug)
    expect(created.oneTimePassword.length).toBeGreaterThan(0)

    // Log in as the new fleet's FleetAdmin using the one-time password.
    adminToken = await apiLogin(created.adminEmail, created.oneTimePassword, created.slug)

    // FleetAdmin adds a driver and creates an order — the full post-onboarding chain.
    await addDriver(adminToken, created.slug)
    const order = await createOrder(adminToken, created.slug)
    expect(order.publicCode.length).toBeGreaterThan(0)

    // Brand the fleet so AC#4 can assert a distinct color/welcome.
    await brandFleet(adminToken, created.slug)
  })

  test('AC4_RuntimeBranding — the second fleet customer app shows its own name + color with no rebuild', async ({ page }: { page: Page }) => {
    // Drive the second fleet via ?fleet= (no *.localhost DNS locally — see header + runbook).
    await page.goto(`/customer?fleet=${NEW_FLEET.slug}`)

    // The fleet name from GET /public/fleet renders in the header (h1), not the base app name.
    await expect(page.getByRole('heading', { level: 1, name: NEW_FLEET.name })).toBeVisible({ timeout: 10_000 })

    // The welcome text from the fleet renders on the home screen.
    await expect(page.getByText(NEW_FLEET.welcomeText)).toBeVisible()

    // The primary color is applied at runtime: the "Vlastní adresa" primary button uses
    // theme.colors.primary as its background. Assert the computed background matches the fleet color.
    const primaryButton = page.getByRole('button', { name: 'Vlastní adresa' })
    await expect(primaryButton).toBeVisible()
    const bg = await primaryButton.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).toBe(EXPECTED_RGB)
  })
})
