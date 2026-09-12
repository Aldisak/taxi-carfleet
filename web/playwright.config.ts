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
    // Capture traces on failure for debugging.
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
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
