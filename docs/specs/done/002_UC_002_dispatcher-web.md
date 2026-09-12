# UC-002 — Dispatcher web app

- **Sequence:** 002
- **Stack:** mixed — frontend (`/web`, new) + backend support endpoints (`/api`)
- **Complexity tag:** novel (first frontend code in the repo)
- **Mode:** autonomous batch run (user directive 2026-09-11: all gates pre-approved, parallel lanes, interrupt only on unresolvable blocks)
- **Sources of truth:** `.claude/state/00-PROJECT-CONTEXT.md` (§4 frontend stack — styled-components per docs/decisions.md, §10 SignalR contract, §11 UX rules, §12 DoD), `.claude/state/02-dispatcher-web.md` (screens + behavior + ACs — authoritative detail, do not restate), `docs/decisions.md`, `docs/api.md` (generated — current API surface).

## Title

Dispatcher web app: the `/x/*` React SPA (login, three-column board with live orders/drivers/map, order drawer, search, settings) plus the backend endpoints assignment 01 deliberately deferred.

## Actors

- **Dispatcher** — creates orders from phone calls (<20 s target), assigns/reassigns/cancels, watches the live board and map.
- **FleetAdmin** — everything a dispatcher does + settings (vehicles, staff, fleet).

## Preconditions

- UC-001 backend complete on `main` (34 endpoints, SignalR hub `/hubs/fleet`, seeded demo fleet). Node v20.0.0 + npm 9.6.4 (pin Vite/tooling versions compatible with Node 20.0 — Vite 7 requires ≥20.19, so Vite 5/6 line). Docker available.
- Frontend stack (context §4, amended): React 18 + TypeScript + Vite, **styled-components**, React Router 6, TanStack Query, Zustand (tiny cross-cutting state only), Leaflet + OSM, @microsoft/signalr, i18next (Czech default, en fallback), Vitest, Playwright.

## Main flow (system level)

**Lane A — backend support (api/, parallel to Lane B):**
1. `GET /api/v1/geo/suggest?q=` — Nominatim/Photon proxy (self-hostable later; server-side so keys/urls stay ours). DispatcherOnly. Debounce-friendly, returns label + lat/lng.
2. `GET /api/v1/geo/route` — OSRM public API proxy (distance/duration for price estimate). DispatcherOnly.
3. `PATCH /api/v1/orders/{id}` — partial edit (address/time/note/passengers), Dispatcher only, allowed only in New/Assigned, writes an `Updated`-style OrderEvent (note: OrderEventType has NoteAdded; adding an enum member `Updated` is a string-stored enum — no migration).
4. `POST /api/v1/drivers/{id}/status` — dispatcher manual override (Free/Busy/Offline) for fallback mode; writes the FIRST AuditLog row (entity=Driver, action=StatusOverride, actor); publishes DriverStatusChanged; must not touch order state.
5. `POST /api/v1/staff/{id}/reset-password` — FleetAdmin; returns new temp password exactly once (mirror invite pattern).

**Lane B — frontend (web/, sequential):**
6. Scaffold: Vite + TS strict + eslint (flat config, --max-warnings 0) + vitest + styled-components + router `/x/*` group + TanStack Query + api client (fetch wrapper, JWT storage, 401→login redirect, X-Fleet-Slug header) + i18next cs/en + global theme (desktop-first ≥1280).
7. Login `/x/login` (fleet slug prefill from subdomain, localStorage remember, Czech errors).
8. Board `/x` three-column layout: order form (F2 focus, Enter submit, quick chips, autocomplete via geo/suggest, live price preview via geo/route + tariff, clears + refocuses on submit), orders column (sections Nové/Přiřazené/Probíhající/Naplánované/Dokončené dnes, cards per assignment, 2-min red timer), drivers column (status pills, position age, manual override), assign/reassign/cancel flows (cancel requires reason from list).
9. Realtime: SignalR client wired to OrderChanged/DriverStatusChanged/DriverPositionChanged; optimistic updates + 409 reconcile ("Objednávku mezitím změnil někdo jiný"); disconnect banner + backoff reconnect + refetch; notification sound + mute toggle.
10. Map: Leaflet, driver markers (heading, status colors, 1 s redraw throttle), pickup pins, pin↔card highlight, toggle/4th-panel ≥1600.
11. Order drawer `/x/orders/:id`: editable fields in New/Assigned via PATCH, Czech event timeline, transition buttons from allowedActions.
12. Search `/x/orders`: filters (date/status/driver/text), today default, row→drawer, client-side CSV export.
13. Settings `/x/settings` (FleetAdmin): Vozidla CRUD, Lidé CRUD + reset password, Fleet tab (offer timeout editable? — backend has no fleet-settings update endpoint; v1: read-only display + auto-dispatch toggle disabled "v1.1"; document as assumption or add a small endpoint in Lane A — designer decides).
14. E2E: Playwright — login → create order via quick chip → assign to free driver (AC #1, ≤6 interactions), realtime card move on driver accept via API (AC #2). Harness: API run against compose Postgres with seed, or TestServer-equivalent — designer decides and documents.

## Acceptance criteria

The 8 in `.claude/state/02-dispatcher-web.md` §Acceptance criteria are binding verbatim (Playwright create+assign ≤6 interactions; realtime move <1 s; map markers move; cancel reason in timeline; override → AuditLog row; 1280×720 no h-scroll; cs.json complete + en fallback; Lighthouse a11y ≥90 — measure best-effort in CI-less env, document method).

## Out of scope

Route/zone management (06), pricing/quote endpoint (06 — until then estimate = tariff × OSRM distance), reports (07), customer/driver PWAs (03/04), push (05), PWA service worker for /x (drivers/customers need it, dispatcher desktop doesn't — v1 skip), drag-to-assign (bonus only if trivial).

## Non-functional requirements

- All strings via i18next `cs.json`/`en.json`; Czech default, formal for customers n/a here — dispatcher UI Czech-first.
- Desktop-first ≥1280; keyboard-first form; never block the order form with a dialog (context §11 + assignment).
- Quality gate (blocking): backend `dotnet build -warnaserror` + `dotnet test`; frontend `tsc --noEmit`, `eslint --max-warnings 0`, `vitest run`, `playwright test`. Informational: `dotnet format --verify-no-changes`, `prettier --check`.
- Frontend conventions (no .claude/rules for TS exist): TS strict, functional components + hooks, one component per file, colocated feature folders `web/src/features/<feature>` per context §5, shared in `web/src/shared`, styled-components with a typed theme, no `any`, named exports.

## Notes for the designer

- Split WIs into the two lanes; mark each WI `lane: "api" | "web"`. Lane A WIs are individually small (S) and independent of each other except shared Program.cs registration (use the per-feature extension pattern). Lane B is a dependency chain: scaffold → (login) → board-static → realtime → map/drawer/search/settings (the last four are UI-parallel in principle but share i18n/api-client files — keep sequential; reviews overlap the other lane).
- `verification.tool` enum extended for this UC: `dotnet-test` | `dotnet-build` | `npm-lint` | `npm-tsc` | `vitest` | `playwright`.
- Node 20.0.0 pin constrains Vite (<7). Pin exact tooling versions in the scaffold WI.
- Playwright E2E needs the real API + Postgres + seed; design the harness explicitly (compose service vs scripts). Browsers are being prefetched by the conductor.
- The `.claude/rules/*.md` are C#-only; for Lane B cite the spec NFR conventions above + context §5/§11 instead.
