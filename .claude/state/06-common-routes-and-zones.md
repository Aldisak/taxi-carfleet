# Assignment 06 — Common routes, zones & pricing

Read `00-PROJECT-CONTEXT.md` first. Backend part can start after 01; UI parts require 02 and 04.

## Goal

Fixed-price offers the dispatcher manages and customers trust. Examples from the founder:
- "From train station to city center — 100 CZK" (PointToPoint)
- "Anywhere within Kutná Hora — 110 CZK" (Zone)
- "From Kutná Hora to Kolín — 300 CZK" (ZoneToZone)

Plus a single pricing endpoint everything else calls.

## Scope

**In:** zone editor, route editor, matching algorithm, `pricing/quote` endpoint, price locking on orders,
customer route list, driver price badge already exists (03) — verify it renders all cases, quick-place chips for dispatcher.
**Out:** dynamic/surge pricing, promo codes.

## Backend

### 1. Zones
- CRUD `/api/v1/zones` (FleetAdmin). Circle (center + radius) or Polygon (≤ 200 points).
- `ZoneService.Contains(zone, lat, lng)`: haversine for circles, ray-casting for polygons. Pure functions with unit tests including points on edges and polygons crossing nothing exotic (Czech coordinates only).

### 2. Routes
- CRUD `/api/v1/routes` (FleetAdmin), soft delete, `PATCH /{id}/enable`, `PATCH /{id}/priority`.
- Validation per type:
  - PointToPoint: `FromLat/Lng`, `ToLat/Lng`, plus `FromRadiusMeters` and `ToRadiusMeters` (default 150) — a point route matches if pickup is within `FromRadius` of `From` and dropoff within `ToRadius` of `To`. Add these two columns via migration.
  - Zone: `FromZoneId` required, `To*` null. Matches if pickup is in zone **and** (dropoff is null **or** dropoff is in the same zone).
  - ZoneToZone: `FromZoneId` and `ToZoneId` required, matches if pickup in from-zone and dropoff in to-zone. Add `IsBidirectional` (bool, default true) — Kolín→KH costs the same.
- Validity: `ValidDays` bitmask (Mon=1 … Sun=64), `ValidFromTime`/`ValidToTime` (time-of-day, may wrap midnight, e.g. 22:00–06:00 night tariff). Evaluated in the fleet's time zone.

### 3. Quick places
- `Place` entity: `Id, FleetId, Name, Lat, Lng, Address, SortOrder, IsEnabled`. CRUD `/api/v1/places`. Used by dispatcher chips (02) and as suggestions in customer address inputs (04). Migration + seed (Kolín station, KH hl.n., KH město, hospital Kolín).

### 4. Pricing
- `POST /api/v1/pricing/quote { pickupLat, pickupLng, dropoffLat?, dropoffLng?, at? }` (any authenticated role; also allowed for anonymous customer with fleet slug for the home screen):
  1. Candidate routes = enabled, valid at `at` (default now), not deleted.
  2. Order of precedence: PointToPoint → ZoneToZone → Zone. Within a type, highest `Priority`, then lowest price.
  3. If matched → `{ type: "Fixed", priceCzk, routeId, routeName }`.
  4. Else if dropoff known → Mapy.com route distance/duration → tariff: `max(Minimum, Base + PerKm × km)` rounded **up** to 10 CZK → `{ type: "Estimate", lowCzk, highCzk, distanceKm, durationMin }` where low/high = ±10 % rounded to 10. (UC-010: if Mapy is `Unavailable`, fall back to a haversine ×1.3 estimate with a **wider ±20 % band** flagged as "orientační odhad" — never a 502.)
  5. Else → `{ type: "Meter", tariff summary }`.
- `GET /api/v1/routes/available?at=` → routes valid now, for the customer home screen (public, fleet from slug). Return only `id, name, type, priceCzk, fromLabel, toLabel`.
- Order creation calls the same service and **locks** `PriceType`, `FixedPriceCzk`/`EstimatedPriceCzk`, `RouteId` on the order. Later route edits never touch existing orders (test this).
- Driver override on completion (03) stores `FinalPriceCzk` + `PriceOverrideReason` and writes `PriceOverridden` event; dispatcher sees it highlighted in the order detail and in the daily report.

## Dispatcher UI (02, Settings → "Trasy a zóny")

- **Zóny** tab: list; editor with Leaflet map — draw circle (click center, drag radius) or polygon (click points, double-click to close). Name, enable. Show all zones on one map with labels.
- **Trasy** tab: list sorted by priority with drag-to-reorder; badge with type; price; validity summary ("Po–Ne, celý den" / "Pá–So 22:00–06:00"); enable toggle.
  - Editor: type selector changes the form. Point pickers use the address autocomplete + map pin. Zone selectors are dropdowns of existing zones. Price in CZK. Validity days as toggle chips, times as two inputs.
  - Live **"Otestovat"** panel: enter a pickup and dropoff, see what `pricing/quote` returns — so the dispatcher can verify a route before enabling it.
- **Místa** tab: quick places CRUD with map pin.

## Customer UI (04)
- Home shows `routes/available`; already specified. Verify zone-restricted inputs use the real zones now.

## Acceptance criteria

1. Unit tests: matching precedence with overlapping routes; bidirectional zone-to-zone; night-tariff window wrapping midnight; pickup on a zone edge.
2. Seeded routes: quote for (KH station → KH center) returns Fixed 100; (anywhere in KH → nowhere) returns Fixed 110; (KH → Kolín) returns Fixed 300 in both directions; (Kolín → Prague) returns an Estimate range; a pickup outside every zone with no dropoff returns Meter.
3. Changing a route's price after an order was created does not change that order's price.
4. Dispatcher can draw a polygon zone, create a Zone route from it, test it in the "Otestovat" panel, and enable it — Playwright.
5. Customer home shows only routes valid at the current time (test by creating a route valid only at 03:00–04:00).
6. Driver override with reason appears in the order timeline and is flagged in order detail.
