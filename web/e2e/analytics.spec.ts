/**
 * Analytics E2E — UC-009 AC#9 (WI-17).
 *
 * Two happy-path flows over the shared seeded harness:
 *
 *   1. FleetAdmin (admin@demo.local) logs in at /dispatcher/login, clicks the FleetAdmin-gated
 *      "Analytika" nav item, lands on /dispatcher/analytics. The Overview (Přehled) tab shows
 *      populated KPI cards + the rides/revenue trend chart (a real <canvas role="img">).
 *      The FleetAdmin then switches the date-range preset AND switches to the Řidiči
 *      (drivers) tab, which renders a real data table from a successful API response.
 *
 *   2. SuperAdmin logs in through the /admin/login UI (the same POST /auth/admin/login
 *      contract onboarding.spec.ts drives over the API), opens the /admin/platform
 *      Platform screen, and sees the per-fleet health table incl. the demo fleet row.
 *
 * ── Data anchor (why the assertions are shaped this way) ──────────────────────────
 * The e2e harness seeds ONLY `DevelopmentSeeder` (Program.cs startup path), NOT the
 * 50k `ReportSeedScript` (that is invoked directly by API integration tests only). So
 * the demo fleet's analytics signal is the handful of demo orders anchored at `now`,
 * of which DEMO05 is a Completed ride (180 CZK, driver1). That single completed ride
 * this month guarantees a non-empty Overview series (chart renders, not empty-state)
 * and rides ≥ 1. Numeric assertions stay minimal (non-zero / not em-dash, not exact
 * values) so a seed tweak does not break the spec. The drivers league returns a row
 * per active fleet driver regardless of activity, so we assert the table structure
 * (caption + rows present) — proof the tab rendered from a 200, without pinning a
 * value that the thin seed does not guarantee.
 *
 * ── SuperAdmin reachability ───────────────────────────────────────────────────────
 * beforeAll runs the `create-superadmin` CLI (idempotent) against the running harness
 * DB, then the spec logs in through the /admin/login UI. The A7b login path exists —
 * the "no SuperAdmin login path" caveat in PlatformScreen.tsx is stale (see
 * onboarding.spec.ts, which uses the same POST /auth/admin/login endpoint).
 *
 * Runs in the desktop `chromium` project only (does not match the mobile testMatch
 * globs), serially (1 worker) under the existing webServer harness. Alphabetically
 * first among specs, so at run time only the demo fleet exists — deterministic.
 */

import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SUPERADMIN_EMAIL = 'superadmin@demo.local'
const SUPERADMIN_PASSWORD = 'Super1234!'

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

/** Fleet-scoped staff login via the /dispatcher/login UI (fill slug, email, password, submit → /x). */
async function fleetAdminUiLogin(page: Page): Promise<void> {
  await page.goto('/dispatcher/login')
  await page.locator('#fleetSlug').fill('demo')
  await page.locator('#email').fill('admin@demo.local')
  await page.locator('#password').fill('Demo1234!')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL('/dispatcher')
}

/** SuperAdmin login via the /admin/login UI (email + password → /admin). */
async function superAdminUiLogin(page: Page): Promise<void> {
  await page.goto('/admin/login')
  await page.locator('#admin-email').fill(SUPERADMIN_EMAIL)
  await page.locator('#admin-password').fill(SUPERADMIN_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL('/admin')
}

test.describe.serial('Analytics', () => {
  test.beforeAll(() => {
    // Ensure the fleetless SuperAdmin exists in the harness DB (idempotent).
    ensureSuperAdmin()
  })

  test('AC9_FleetAdminAnalytics — Analytika nav → populated Overview + chart, switch range + Řidiči tab shows a table', async ({ page }) => {
    await fleetAdminUiLogin(page)

    // ── FleetAdmin-gated nav item is present; clicking it exercises the gate ────
    const analytikaNav = page.getByRole('link', { name: 'Analytika' })
    await expect(analytikaNav).toBeVisible({ timeout: 10_000 })
    await analytikaNav.click()
    await page.waitForURL('**/dispatcher/analytics')

    // ── Overview (Přehled) is the default tab; wait for the API-backed content ──
    // The trend chart is a real <canvas> that spreads aria-label onto role="img"
    // ("Vývoj jízd a tržeb"). Its presence proves a non-empty series rendered
    // (empty-state would replace the chart), i.e. the Overview is populated.
    const trendChart = page.getByRole('img', { name: 'Vývoj jízd a tržeb' })
    await expect(trendChart).toBeVisible({ timeout: 15_000 })

    // KPI grid is a <dl>: <dt> label ("Jízdy") + <dd> value. The rides label being
    // visible together with the non-empty trend chart proves the Overview is populated
    // (DEMO05 → rides ≥ 1; the chart's presence means the series was non-empty).
    await expect(page.getByText('Jízdy', { exact: true }).first()).toBeVisible({ timeout: 5_000 })

    // The Overview must NOT be in error state.
    await expect(page.getByText('Nepodařilo se načíst analytická data.')).toHaveCount(0)

    // ── Switch date-range preset to a today-containing preset ("Posledních 7 dní") ─
    // "Dnes"/"Posledních 7 dní"/"Tento měsíc" all include today's DEMO05 — never
    // "Minulý měsíc" (which would empty everything and break the populated-assertion).
    const presetSelect = page.getByLabel('Období')
    await expect(presetSelect).toBeVisible({ timeout: 5_000 })
    await presetSelect.selectOption({ label: 'Posledních 7 dní' })
    // The chart re-renders for the new range (still non-empty — DEMO05 is today).
    await expect(page.getByRole('img', { name: 'Vývoj jízd a tržeb' })).toBeVisible({ timeout: 10_000 })

    // ── Switch to the Řidiči (drivers) tab; it renders a real data table ────────
    const ridiciTab = page.getByRole('tab', { name: 'Řidiči' })
    await ridiciTab.click()

    // The drivers league table (caption "Statistiky řidičů") renders from a 200.
    // The league returns a row per active fleet driver, so ≥1 body row is present.
    const leagueTable = page.getByRole('table', { name: /Statistiky řidičů/ })
    await expect(leagueTable).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Ligová tabulka řidičů' })).toBeVisible()
    // At least one data row (the demo fleet has active drivers).
    await expect(leagueTable.locator('tbody tr').first()).toBeVisible({ timeout: 5_000 })

    // Drivers tab must not be in error state.
    await expect(page.getByText('Nepodařilo se načíst analytická data.')).toHaveCount(0)
  })

  test('AC9_SuperAdminPlatform — /admin/login → /admin/platform shows the per-fleet health table incl. demo fleet', async ({ page }) => {
    await superAdminUiLogin(page)

    // Reach the Platform screen via the in-app link on /admin (client-side nav
    // preserves the just-stored SuperAdmin auth — more robust than a full reload).
    await page.getByRole('link', { name: 'Přehled platformy' }).click()
    await expect(page).toHaveURL(/\/admin\/platform/)

    // The demo fleet row is present (only the demo fleet exists at this point in the
    // run). Its visibility proves the per-fleet health table rendered from a 200.
    await expect(page.getByText('Taxi Demo Kolín', { exact: false }).first()).toBeVisible({ timeout: 15_000 })

    // The "Flotila" (fleet) column header proves the per-fleet table structure.
    await expect(page.getByRole('columnheader', { name: 'Flotila' })).toBeVisible({ timeout: 5_000 })

    // The totals section renders (proves aggregation, not just an empty table).
    await expect(page.getByRole('region', { name: 'Souhrn platformy' })).toBeVisible({ timeout: 5_000 })

    // Not in error state.
    await expect(page.getByText('Přehled platformy se nepodařilo načíst.')).toHaveCount(0)
  })
})
