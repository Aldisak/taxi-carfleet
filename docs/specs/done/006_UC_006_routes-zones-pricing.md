# UC-006 — Common routes, zones & pricing

- **Sequence:** 006
- **Stack:** mixed — backend (`/api`: zones, routes, places, pricing) + frontend (`/web`, dispatcher `/x` Settings "Trasy a zóny" + customer `/c` verification)
- **Complexity tag:** novel (zone geometry — haversine circles + ray-casting polygons; route matching precedence; validity windows wrapping midnight in the fleet TZ; price-locking on orders; Leaflet zone/route editor with draw interactions)
- **Mode:** autonomous batch run (standing user directive renewed 2026-09-12: gates A–E pre-approved, parallel lanes, use backend-developer (api) / frontend-developer (web) agents, interrupt only on 3-round blocks / quality-gate failures / undecidable scope. No git remote → ship = local commit on a feature branch; no push/PR).
- **Sources of truth:** `.claude/state/00-PROJECT-CONTEXT.md` (§4 stack, §6 conventions, §7 multi-tenancy, §8 state machine/price-lock, §10 SignalR, §11 UX), `.claude/state/06-common-routes-and-zones.md` (zones/routes/places/pricing/UI/ACs — authoritative, do not restate), `docs/api.md`, `docs/decisions.md`, CLAUDE.md facts.

## Title

Fixed-price offers the dispatcher manages and customers trust: zone editor, route editor with a type-aware matching algorithm, quick places, a single `pricing/quote` endpoint everything calls, price-locking on order creation, and the dispatcher "Trasy a zóny" Settings UI — formalizing what UC-004 stubbed (tariff-estimate quote, `routes/common`, zone validation).

## Actors

- **FleetAdmin / Dispatcher** — manages zones, routes, places; tests a route in the "Otestovat" panel before enabling.
- **Customer** — sees only valid-now routes on the home screen; zone-restricted address inputs validate against real zones.
- **Driver** — price badge already exists (UC-003); verify it renders Fixed/Estimate/Meter; override-on-completion flagged in order detail + report.
- **System** — pricing service (called by order creation → locks price; by customer home; by the "Otestovat" panel), OSRM for estimate fallback.

## Preconditions

- UC-001/002/003/004 shipped (commit `46db3b0`): backend 329 tests, web 869 unit + 10 e2e. Existing to reuse/verify against SOURCE (do not assume): the `Route` entity (Type, PriceCzk, From/To Lat/Lng, FromZoneId/ToZoneId, ValidDays, ValidFromTime/ValidToTime, IsEnabled, DeletedAt, Priority), a `Zone` entity (jsonb Polygon per CLAUDE.md) + `ZoneService`/Contains if present, the UC-004 `pricing/quote` (CustomerOnly, tariff estimate — to be REPLACED/extended by the real matching service here), `routes/common` (Anonymous, valid-now — reconcile with the assignment's `routes/available`), the Tariff entity (Base/PerKm/Minimum/IsDefault), order create + price-lock fields (PriceType, FixedPriceCzk/EstimatedPriceCzk, RouteId), OrderStateMachine PriceOverridden event (UC-001/007), `geo/suggest` + OSRM `IGeoProvider`, the dispatcher Settings shell (/x) + customer home (/c).

## Main flow (system level)

**Lane A — backend (api/):**
1. **Zones**: CRUD `/api/v1/zones` (FleetAdmin), Circle (center+radius) or Polygon (≤200 pts). Pure `ZoneService.Contains(zone,lat,lng)` — haversine for circles, ray-casting for polygons — with unit tests (points on edges, Czech coords). Reconcile with any existing Zone entity/jsonb polygon.
2. **Routes**: CRUD `/api/v1/routes` (FleetAdmin), soft delete, `PATCH /{id}/enable`, `PATCH /{id}/priority`. Per-type validation: PointToPoint (+ new `FromRadiusMeters`/`ToRadiusMeters` default 150 via migration; matches if pickup within FromRadius of From and dropoff within ToRadius of To), Zone (FromZoneId; matches if pickup in zone and (dropoff null or in same zone)), ZoneToZone (From/To zones; + new `IsBidirectional` default true via migration). Validity: `ValidDays` bitmask (Mon=1…Sun=64), `ValidFromTime`/`ValidToTime` (may wrap midnight), evaluated in the fleet TZ.
3. **Places**: new `Place` entity (Id, FleetId, Name, Lat, Lng, Address, SortOrder, IsEnabled) + CRUD `/api/v1/places` + migration + seed (Kolín station, KH hl.n., KH město, Kolín hospital). Used by dispatcher chips + customer address suggestions.
4. **Pricing**: `POST /api/v1/pricing/quote {pickupLat,pickupLng,dropoffLat?,dropoffLng?,at?}` (any authed role + anonymous-customer-with-slug). Matching: candidates = enabled, valid at `at` (default now), not deleted; precedence PointToPoint → ZoneToZone → Zone; within a type highest Priority then lowest price. Matched → `{type:"Fixed",priceCzk,routeId,routeName}`; else dropoff known → OSRM → tariff `max(Minimum, Base+PerKm×km)` rounded UP to 10 → `{type:"Estimate",lowCzk,highCzk,distanceKm,durationMin}` (±10% rounded to 10); else `{type:"Meter",tariff summary}`. `GET /api/v1/routes/available?at=` (public, fleet-from-slug) → valid-now routes `{id,name,type,priceCzk,fromLabel,toLabel}`. Order creation calls the SAME service and LOCKS PriceType/FixedPriceCzk/EstimatedPriceCzk/RouteId — later route edits never touch existing orders (test). Driver override (UC-003) stores FinalPriceCzk+PriceOverrideReason + PriceOverridden event; dispatcher detail + daily report flag it.

**Lane B — frontend (web/):**
5. **Dispatcher Settings "Trasy a zóny"** (/x): **Zóny** tab (list + Leaflet editor: draw circle click-center-drag-radius / polygon click-points-double-click-close; name, enable; all zones on one labeled map); **Trasy** tab (list sorted by priority, drag-to-reorder, type badge, price, validity summary e.g. "Po–Ne, celý den"/"Pá–So 22:00–06:00", enable toggle; type-aware editor with address-autocomplete+map-pin point pickers, zone dropdowns, CZK price, validity day chips + time inputs; live **"Otestovat"** panel calling pricing/quote); **Místa** tab (places CRUD with map pin).
6. **Customer** (/c): home shows `routes/available` (reconcile with UC-004's routes/common); zone-restricted inputs now validate against real zones.
7. **Driver** (/d): verify the existing price badge renders Fixed/Estimate/Meter for the real quote shapes (regression check, likely no new code).
8. **E2E**: dispatcher draws a polygon zone → creates a Zone route → tests it in "Otestovat" → enables it (Playwright, /x); customer home shows only valid-now routes (route valid only 03:00–04:00 hidden otherwise).

## Acceptance criteria

The 6 in `.claude/state/06-common-routes-and-zones.md` are binding: (1) matching-precedence/bidirectional/night-wrap/edge unit tests; (2) seeded-route quotes (KH station→center Fixed 100; anywhere-in-KH Fixed 110; KH↔Kolín Fixed 300 both directions; Kolín→Prague Estimate; outside-all-zones-no-dropoff Meter); (3) route price edit does not change an existing order's price; (4) dispatcher draw-polygon→Zone-route→Otestovat→enable (Playwright); (5) customer home shows only valid-now routes; (6) driver override with reason in timeline + flagged in detail.

## Out of scope

Dynamic/surge pricing, promo codes. Assignment 05 (notifications), 07 (reports/audit — though the daily-report override flag is referenced), 08 (infra).

## Non-functional requirements

- Multi-tenancy: every new entity (Zone, Place, + Route/Tariff existing) is FleetId-scoped with the EF query filter; tenant-isolation integration test per feature; public `routes/available` fleet-safe by slug (mirror UC-004 public endpoints).
- Conventions: `.claude/rules` (api-design REPR, vertical slices, ef-core, validation, error-handling, csharp-style, logging); web-* rules; reuse UC-002/004 infra (Leaflet lazy map, api client, i18n cs/en parity formal "vy" for customer, theme); money integer CZK; times in fleet TZ (Europe/Prague); pure geometry/matching/validity modules fully unit-tested.
- Quality gate (blocking): api build -warnaserror + test; web lint (--max-warnings 0) + tsc + test + build + size + playwright. Informational: format.

## Notes for the designer

- Split Lane A (api) + Lane B (web) WIs with lane + depends_on, topologically ordered; keep slices atomic. The matching/precedence service + ZoneService geometry are the novel backend risk — design them as pure, heavily-unit-tested modules. Investigate the EXISTING Route/Zone/Tariff entities, the UC-004 pricing/quote + routes/common, and the order price-lock fields against SOURCE before designing; this UC REPLACES the UC-004 tariff-only stub with the real matching service and must reconcile `routes/common` (UC-004, Anonymous) vs `routes/available` (assignment 06) — decide one canonical endpoint + note the migration of the UC-004 client.
- Migrations touch Route (FromRadiusMeters/ToRadiusMeters/IsBidirectional) + new Zone(if not present)/Place — serialize migration-adding WIs via depends_on (one coherent model snapshot), as UC-004 did.
- Carry forward review lessons: client.ts response-envelope shapes (unwrap named envelopes — the {routes}/{items} class of bug); Leaflet lazy; tenant-isolation tests; anonymous-endpoint tenant-by-slug pattern; price-lock-immutability test is AC#3 and load-bearing.
