import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration for UC-002 dispatcher web app.
 *
 * webServer array:
 *  1. API harness: node scripts/e2e-api.mjs — starts docker postgres + dotnet run,
 *     waits on /health/ready (migrate + seed included in dotnet startup).
 *  2. Vite dev server at localhost:5173.
 *
 * Tests run with a single worker (serial) against Chromium only.
 * baseURL is http://localhost:5173.
 *
 * Run:  npm run e2e
 */
export default defineConfig({
  testDir: './e2e',

  // Serial execution — tests depend on shared DB state (dispatcher assigns, driver accepts).
  workers: 1,
  fullyParallel: false,

  // Retry once on CI; zero locally so failures surface immediately.
  retries: process.env.CI ? 1 : 0,

  reporter: 'list',

  use: {
    baseURL: 'http://localhost:5173',
    // Chromium only (as per B11 spec).
    ...devices['Desktop Chrome'],
    // Pin the browser locale so applyInitialLanguage() detects cs-CZ and every
    // existing e2e spec stays Czech (UC-011 AC#7). No project overrides locale.
    locale: 'cs-CZ',
    // Capture traces on failure for debugging.
    trace: 'on-first-retry',
  },

  projects: [
    {
      // Desktop project — dispatcher.spec.ts + onboarding.spec.ts (UC-007 AC#3/AC#4,
      // a dispatcher/admin + customer-branding desktop flow). Runs first, serially.
      // Ignore BOTH the driver and the customer MOBILE specs so they never double-run here;
      // the mobile projects below use testMatch (driver/customer only), so onboarding.spec.ts —
      // matched by neither testMatch — runs ONLY in this desktop project (no double-run).
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [/driver\.spec\.ts/, /customer\.spec\.ts/],
    },
    {
      // Mobile driver PWA project — driver.spec.ts only, Pixel 5 viewport.
      // geolocation permission + a seed coordinate so the home location check and
      // position reporting do not hit a denied path.
      name: 'mobile-driver',
      use: {
        ...devices['Pixel 5'],
        permissions: ['geolocation'],
        geolocation: { latitude: 50.0281, longitude: 15.2006 },
      },
      testMatch: /driver\.spec\.ts/,
    },
    {
      // Mobile customer PWA project (UC-004 B-e2e) — customer.spec.ts only, Pixel 5 viewport.
      // geolocation permission + a seed coordinate so the custom-order "use my location" path and
      // any map interaction do not hit a denied prompt. Reuses the single shared webServer harness.
      name: 'mobile-customer',
      use: {
        ...devices['Pixel 5'],
        permissions: ['geolocation'],
        geolocation: { latitude: 50.0281, longitude: 15.2006 },
      },
      testMatch: /customer\.spec\.ts/,
    },
  ],

  webServer: [
    {
      // Entry 1: API harness (docker db + dotnet run).
      // This script tears down the previous volume, starts db, and spawns the API.
      command: 'node scripts/e2e-api.mjs',
      url: 'http://localhost:5249/health/ready',
      reuseExistingServer: false,
      // Generous timeout: first run needs docker pull + EF migrate + seed (~60-120 s).
      timeout: 240_000,
    },
    {
      // Entry 2: Vite dev server.
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
