# Demo & manual verification

## Lighthouse accessibility (manual, per UC)

The Definition of Done requires Lighthouse accessibility ≥ 90 on every client. Axe assertions
in the component tests cover jsdom-computable rules; contrast and full-layout a11y are verified
manually with Lighthouse (jsdom cannot compute contrast — see `rules/web-accessibility.md`).

Run against a production build:

```bash
cd web && npm run build && npm run preview   # serves dist on http://localhost:4173
npx lighthouse http://localhost:4173/dispatcher          --only-categories=accessibility --quiet
npx lighthouse "http://localhost:4173/customer?fleet=demo" --only-categories=accessibility --quiet
```

Auth-gated screens (dispatcher board, settings) can't be reached by a bare URL — they
need a logged-in session. Measure them by logging in first (headless Chrome + the real
login form so the SPA token lands in localStorage), then point Lighthouse at the same
Chrome profile. On Node 20 use `lighthouse@12` (`lighthouse@13` requires Node ≥ 22).

### UC-007 screens to check

- **`/admin` (SuperAdmin fleets)** — the create-fleet form + fleet list. One-time-password
  panel uses `role="status"`/`aria-live`; every field has a `<label>`; errors use `role="alert"`.
- **`/x/settings` → Fleet tab** — the self-service form (name, phone, color, logo, welcome,
  offer timeout, SMS cap, disabled auto-dispatch toggle). Color input has an `aria-label`; the
  disabled toggle is `aria-disabled`.
- **`/c?fleet={slug}` (customer runtime branding)** — second-fleet name + color + welcome +
  logo render from `GET /public/fleet` with no rebuild; the gdpr footer link is present.

| Screen | Lighthouse a11y | Date | Notes |
|--------|-----------------|------|-------|
| `/admin` | _pending manual run_ | | SuperAdmin fleets |
| `/dispatcher/settings` (Fleet tab) | _pending manual run_ | | self-service form |
| `/customer?fleet=…` (customer branding) | _pending manual run_ | | runtime branding |

Record the scores above after running Lighthouse; all must be ≥ 90.

### UC-010 screens to check (Mapy.com migration)

The new a11y surfaces are the shared `<MapyMap>` + `MapUnavailableBanner` (degraded map),
the `GeoUsagePanel` credits panel (FleetAdmin settings), and the enriched address
suggestions (street + town). Every new interactive component also ships a `vitest-axe`
assertion covering jsdom-computable rules (all green in the suite); the runs below add
contrast + full-layout coverage.

| Screen | Lighthouse a11y | Date | Notes |
|--------|-----------------|------|-------|
| `/dispatcher` (board — `MapyMap` + degraded banner + order-form suggest) | **90** | 2026-09-15 | Meets the ≥ 90 bar. Failing audits below are pre-existing board UI under Lighthouse's default mobile emulation, not MapyMap-introduced. |
| `/dispatcher/settings` → Fleet tab (`GeoUsagePanel`) | **100** | 2026-09-15 | `td-has-header` is unweighted in the a11y category (score stays 100). |
| `/customer?fleet=demo` (customer entry) | **100** | 2026-09-15 | No failing audits. |

Measured with `lighthouse@12` against the full stack (API harness on :5249 + Vite dev on
:5173 with `/api` proxy), logged in as the seeded FleetAdmin `admin@demo.local`, with **no
Mapy API key configured** — so the map renders its degraded "Mapa dočasně nedostupná" state,
which is the worst-case a11y surface for these screens.

The board's three failing audits (score still 90 ≥ 90):
- `target-size` — touch targets < 48×48 px under Lighthouse's **mobile** emulation; the board
  is a desktop dispatcher screen, so this reflects the emulated viewport, not the real target.
- `aria-allowed-attr` / `label-content-name-mismatch` — pre-existing board-control findings
  (not new UC-010 components). Worth a follow-up cleanup pass on the board, tracked separately
  from UC-010.

Customer *order/tracking* map screens (also `MapyMap`) require a customer OTP session and were
not scored here; their new components are covered by the component-level `vitest-axe` assertions.

Lighthouse a11y ≥ 90 is met on all UC-010 screens measured.
