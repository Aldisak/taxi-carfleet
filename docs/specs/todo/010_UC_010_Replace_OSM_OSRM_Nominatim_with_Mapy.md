# Assignment 010 — Replace OSM tiles + OSRM + Nominatim with Mapy.com REST API

Read `00-PROJECT-CONTEXT.md` first. Requires 01, 02 and 04 merged (the geo proxy, dispatcher map, customer map).
This assignment supersedes every mention of OpenStreetMap tiles, `router.project-osrm.org`, Nominatim and Photon
in assignments 00–08. Update those documents as part of this work (see §7).

## Why

The free public endpoints (OSM tile servers, OSRM demo, Nominatim, Photon) are not for production: they
rate-limit, block, and go down without notice. Mapy.com (Seznam) has the best address and road data for
Czech towns, one REST API for tiles + suggest + geocoding + routing, and a free monthly allowance that
covers a fleet of our size. Realistic usage: ~1,000 rides/month → 200–400k credits → 0–250 CZK/month.

Credit prices (verify at https://developer.mapy.com/pricing/ before starting; they change):
1 credit per map tile, 4 credits per suggest/geocode/reverse-geocode, 4 credits per route.
Basic tariff: 250,000 free credits/month, then 1.60 CZK per 1,000.

## Goal

All map functionality runs on Mapy.com, through our backend where possible, with caching that keeps a
one-fleet deployment inside the free tier, hard cost caps, and graceful degradation when credits run out.

## Scope

**In:** two API keys, backend geo proxy rewrite, tile layer swap in all three clients, caching, credit
budget + monitoring, attribution, degradation modes, docs update.
**Out:** matrix routing, panoramas, self-hosting anything, changing the navigation handoff (deep links stay).

## 1. Accounts and keys

- Create one Mapy.com developer account for the platform (us), one **Project per fleet** so consumption
  and caps are per tenant. Store per-fleet keys in `fleet_settings` (encrypted at rest with the app's data-protection key): `MapyServerKey`, `MapyBrowserKey`.
    - **Server key**: used only by the API for suggest, geocode, reverse geocode, routing. Never sent to browsers.
    - **Browser key**: used only for tiles, restricted in the Mapy.com console to the fleet's domain(s) (HTTP referrer). Delivered to clients via `GET /public/fleet` and `GET /me/config`.
- Platform-level fallback keys in env (`Mapy__ServerKey`, `Mapy__BrowserKey`) used when a fleet has none (demo fleet, first days of a new tenant).
- Set a **monthly consumption cap** in the Mapy.com console for each project equal to the free credits, and document how the admin raises it. There is no paid consumption without consent; the app must survive hitting the cap (§6).
- Customer PWA per fleet is a public app and may qualify for the **Extended tariff** (10M free credits): conditions are public access, Mapy.com data only, logo + attribution, listing in their catalog. Implement attribution correctly so a fleet can apply; do not depend on it.

## 2. Backend geo proxy (`/Features/Geo`)

Rewrite `/api/v1/geo/*` to call Mapy.com. All calls go through one `IMapyClient` (typed `HttpClient`, timeout 4 s, 1 retry on 5xx, circuit breaker after 5 failures/30 s).

| Our endpoint | Mapy.com | Rules |
|---|---|---|
| `GET /geo/suggest?q=&near=lat,lng` | `/v1/suggest` (`type=regional.address,regional.street,poi`, `lang=cs`, `locality`/`preferBBox` around the fleet's area) | Min 3 chars. Debounce is the client's job (350 ms), but server also rejects > 5 req/s per user. |
| `GET /geo/geocode?q=` | `/v1/geocode` | Used when the user submits a typed address without picking a suggestion. |
| `GET /geo/reverse?lat=&lng=` | `/v1/rgeocode` | "Použít moji polohu" and map-pin drop. Round coordinates to 4 decimals before calling (≈ 11 m) to improve cache hits. |
| `POST /geo/route { from, to }` | `/v1/routing/route` (`routeType=car_fast`, `lang=cs`) | Returns distance m, duration s, and a simplified geometry (max 200 points). |
| `GET /geo/config` | – | Returns the browser tile key + tile URL template + attribution HTML for the current fleet. |

Every response includes `X-Geo-Source: mapy` and `X-Geo-Cache: hit|miss` for debugging.

## 3. Caching (this is what keeps it free)

Implement one `GeoCache` (in-process `MemoryCache` + Postgres table `geo_cache (fleet_id, kind, key, value jsonb, created_at)` so cache survives restarts and is shared across instances later).

| Kind | Key | TTL | Notes |
|---|---|---|---|
| suggest | lowercased, trimmed, diacritics-folded `q` + rounded `near` (2 decimals) | 7 days | Most dispatcher queries repeat: "nádraží", "nemocnice", street names. |
| geocode | folded `q` | 30 days | |
| reverse | lat,lng at 4 decimals | 30 days | |
| route | from + to at 4 decimals | 24 h | Same station→center route is asked hundreds of times. |
| quick places | place id | forever (invalidate on edit) | Never call Mapy for a quick place. |

Additional rules:
- **Quote once per order** (06): `pricing/quote` may call `geo/route` once at creation; the result is stored on the order (`DistanceM`, `DurationS` — add migration).
- **Driver → pickup ETA**: compute at `Accept` with one route call; then refresh **every 60 s at most**, and only while at least one customer tracking screen is subscribed to that order (`order:{id}` group has members) or the dispatcher has the order detail open. Between refreshes, extrapolate ETA from remaining distance and the last average speed — no API call.
- Dispatcher board driver→pickup **distances for the assign picker**: haversine, no API call. The picker shows "≈ 2,3 km vzdušnou čarou"; the route ETA appears only after assignment.
- Suggest requests are sent only for ≥ 3 characters and are cancelled client-side when the user keeps typing.
- Tiles: browser-cached by default; additionally set `Cache-Control` max-age 7 days on our `/geo/config` and rely on Mapy.com's tile cache headers. Default zoom and fixed initial viewport per fleet (`fleet_settings.MapCenterLat/Lng/Zoom`, add migration) so the board doesn't load the whole country on start.
- Static map for SMS/tracking preview: **do not use** (4 credits each); the tracking link opens the live map instead.

## 4. Frontend changes (`/web`)

- Keep **Leaflet**. Replace the OSM `TileLayer` with the Mapy.com raster tile template from `/geo/config`
  (`basic` set, 256 px; use `@2x` only when `devicePixelRatio > 1.5`). One shared `<MapyMap>` component
  in `shared/map/`; all three apps use it.
- **Attribution**: Mapy.com logo in the map corner (their SVG, linking to mapy.com) plus the text attribution in
  the Leaflet attribution control, exactly as their attribution page specifies. This is mandatory and is also
  what makes the Extended tariff possible.
- Address inputs (customer custom order, dispatcher form, route editor) use `/geo/suggest` with 350 ms debounce, minimum 3 characters, request cancellation, and show the suggestion's `regionalStructure` (street, town) so users can tell Kolín from Kutná Hora at a glance.
- Remove every reference to `router.project-osrm.org`, `nominatim.openstreetmap.org`, `photon.komoot.io`, and `tile.openstreetmap.org` from the codebase. Add an ESLint/`grep` CI check that fails if they reappear.
- Navigation handoff for drivers stays as deep links (Mapy.cz app / Google Maps / Waze), no API cost.

## 5. Credit budget and monitoring

- Table `geo_usage (fleet_id, day, kind, calls, credits_est)` incremented on every **cache miss** (suggest/geocode/reverse/route = 4 credits). Tiles are not counted server-side; estimate them once in `docs/costs.md` from a measured week.
- Fleet settings: `GeoMonthlyCreditBudget` (default 250,000). Dispatcher settings page shows this month's estimated credits and %.
- Alerts (reuse notification engine from 05): push to FleetAdmin at 80 % and 100 %; entry in `notification_log`.
- Ops dashboard endpoint `/api/v1/admin/geo-usage` (SuperAdmin) with per-fleet totals for the month.

## 6. Degradation when Mapy.com is unavailable or capped

The app must stay usable for dispatching even with zero map API:

| Function | Degraded behavior |
|---|---|
| Tiles | Map shows grey background with driver/pickup markers and labels still placed by coordinates; banner "Mapa dočasně nedostupná". |
| Suggest / geocode | Input still accepts free text; order can be created with an address but **no coordinates**; card shows a ⚠ "bez souřadnic"; quick places still work (cached forever). |
| Reverse geocode | Show coordinates instead of an address. |
| Route / quote | Fixed routes still match if pickup/dropoff have coordinates (zone logic is ours); estimate falls back to haversine × 1.3 road factor with a wider range (±20 %) and label "orientační odhad"; else "taxametr". ETA falls back to distance / 35 km/h. |

Circuit breaker open → all of the above automatically; half-open probes every 30 s.

## 7. Documentation updates (part of this assignment)

- `00-PROJECT-CONTEXT.md` §4: replace "Leaflet + OpenStreetMap tiles" and "OSRM" with Mapy.com REST API via backend proxy; add the caching rules summary and the two-key model. Add the domain to the "no vendor lock-in" note as an accepted, replaceable dependency behind `IMapyClient`.
- Assignments 02, 04, 06, 08: replace endpoint names; 08 gains the Mapy.com console setup steps in the runbook (create project, restrict browser key by referrer, set cap) and the cost sheet line.
- `docs/decisions.md`: record the choice, the credit prices on the day you verified them, and the estimated monthly consumption.
- `docs/costs.md`: add measured credits after the first real week.

## Acceptance criteria

1. No request to OSM/OSRM/Nominatim/Photon hosts remains; CI check enforces it.
2. Address suggest in dispatcher form returns Czech results with street + town for "Kollárova" and "nádraží Kolín"; second identical query is a cache hit (`X-Geo-Cache: hit`) with no Mapy.com call (assert on the typed client's counter in tests using a fake handler).
3. Creating an order calls Mapy.com routing at most once; assigning and accepting cause at most one more route call; a customer watching tracking for 5 minutes causes ≤ 5 further route calls; nobody watching → 0.
4. Tile layer renders Mapy.com tiles with correct logo + attribution in all three apps.
5. With the fake client returning 503, the dispatcher can still create, assign and complete an order; the UI shows the degraded banners; estimates show the wider range with "orientační odhad".
6. `geo_usage` reflects cache misses only; the settings page shows the month's estimate; the 80 % alert fires in a test with a budget of 100 credits.
7. Browser key never appears in API logs or in non-tile requests; server key never reaches the browser (test scans `GET /public/fleet` and `GET /me/config` responses).
8. Documentation updated per §7; `docs/decisions.md` has the entry.