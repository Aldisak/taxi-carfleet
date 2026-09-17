# Assignment 018 — Location-relevant address autocomplete

Read `00-PROJECT-CONTEXT.md` first. Requires 010 (Mapy geo) merged. Spans both lanes: a small backend change (`/api`, thread the location hint into the Mapy suggest call) and a frontend change (`/web`, actually send the hint). Composes with UC-014/015 (which surface the map center / GPS) but the backend part is independent and can ship first.

## Why

Address autocomplete currently returns nationwide results with no location bias, so a user in Prague typing "Kouřimská" can see the Kolín street before the Prague one. The plumbing to fix this is *almost* there but disconnected:

- `SuggestEndpoint` already accepts a `near` query param (`lat,lng`) and passes it to `GeoService.SuggestAsync(fleetId, q, near, ct)`.
- But `GeoService.SuggestAsync` uses `near` **only for the cache key** (`GeoCacheKey.Suggest(q, near)`) — it calls `mapyClient.SuggestAsync(q, serverKey, c)` and **never forwards `near`**. So the hint dies at `GeoService`.
- `MapyClient.SuggestAsync` builds `v1/suggest?apikey=…&lang=cs&type=…&limit=5&query=…` with **no location-preference parameter**.
- The frontend `getGeoSuggest(q)` in `client.ts` **doesn't send `near` at all**, and the customer suggest hook never supplies the current location.

Net effect: Mapy suggest is called context-free and ranks by its own global relevance. The fix is to thread the location hint end-to-end and default it to the user's current location.

## Goal

Address suggestions are biased toward the user's current location so the nearest relevant match ranks first (Prague's Kouřimská before Kolín's when the user is in Prague). The `near` hint flows frontend → `SuggestEndpoint` → `GeoService` → `MapyClient` → the Mapy `v1/suggest` request, and the frontend supplies the best available location (the current map center, else GPS, else the fleet's configured center).

## Scope

**In:** forwarding the `near` hint from `GeoService.SuggestAsync` into `IMapyClient.SuggestAsync` and onto the Mapy `v1/suggest` URL via Mapy's documented location-preference parameter; the frontend `getGeoSuggest` sending `near`; the customer suggest surface supplying the current location; tests (URL contains the location param; ranking/hint plumbing); i18n only if any new user-facing string is added (none expected). The cache key already includes `near`, so different locations cache independently — keep that.

**Out:** changing the suggest result shape or the endpoint route/verb/policy; reverse/forward geocode ranking (this UC is about `suggest` only); a new "search this area" UI; server-side re-ranking (we rely on Mapy's location-biased ranking); any change to the rate limiter.

## 1. Backend — forward the location hint to Mapy

- Extend `IMapyClient.SuggestAsync` to accept the location hint, e.g. `SuggestAsync(string query, (double lat, double lng)? near, string? serverKey, CancellationToken ct)` (keep `serverKey` as added by the recent key-resolution fix). Update the `FakeMapyClient`/`CountingMapyClient` test doubles and all call sites.
- `GeoService.SuggestAsync` passes its existing `near` argument straight through to `mapyClient.SuggestAsync` on **both** paths (the `Guid.Empty` fleetless bypass and the cached-factory path).
- `MapyClient.SuggestAsync`: when `near` is present, append Mapy's **location-preference** parameter to the `v1/suggest` URL. ⚠️ **Best-effort — verify the exact parameter name/format against the live Mapy.com REST API docs** (the repo already treats Mapy tile/param details as best-effort — see `MapyConstants` and CLAUDE.md UC-010 WI-09). The likely options are a preferred point (`&lon={lng}&lat={lat}`) or a preferred bounding box (`&preferBBox=…`) derived from the point; pick whichever Mapy documents for suggest ranking, using `CultureInfo.InvariantCulture` for the coordinate formatting (the locale trap). When `near` is null, omit the parameter (current behavior).
- Keep the key-missing short-circuit and the `GeoResult.Unavailable` degradation unchanged.

## 2. Frontend — actually send `near`

- `web/src/shared/api/client.ts`: `getGeoSuggest(q, near?)` appends `&near={lat},{lng}` to the request when a location is provided (the endpoint already parses `Near` leniently — malformed is ignored, never 400).
- The customer suggest hook (`useSuggest`, and its use in the UC-015 search overlay) supplies the **best available location**: the current map center (UC-014/015 provide it) → else the device GPS location → else the fleet config center from `useGeoConfig`. Keep the pure "which location to use" decision in a small tested helper. Debounce/query-key behavior unchanged; the query key must include the `near` value so moving significantly re-queries (round the coordinate to avoid cache thrash on tiny map nudges).
- If UC-014/015 are not yet merged when this runs, wire `near` from the fleet config center (and GPS if already available) in the current suggest usage; the map-center source lands naturally once the new UI exists.

## 3. Tests

- **Backend**: `MapyClient` suggest URL includes the location-preference parameter when `near` is supplied and omits it when null (extend `MapyClientHandlerTests` — the existing URL-capture test is the pattern); `GeoService` forwards `near` to the client (extend `GeoServiceTests`' fake to capture the last `near`, mirroring the `LastServerKey` capture); coordinate formatting uses InvariantCulture. Update all `IMapyClient` implementers/call sites for the new signature.
- **Frontend**: `getGeoSuggest` includes `near` in the query string when given a location; the location-selection helper picks map-center → GPS → config-center in order; `useSuggest` re-queries when the rounded `near` changes. Mock `@/shared/api/client`.

## Acceptance criteria

1. When a location hint is available, address suggestions are biased toward it — e.g. a user near Prague typing "Kouřimská" sees the Prague match ranked above the Kolín one.
2. The `near` hint flows end-to-end: the frontend sends `near`, `SuggestEndpoint` → `GeoService` → `MapyClient` forward it, and the Mapy `v1/suggest` request carries Mapy's location-preference parameter (coordinates formatted with InvariantCulture); when no location is available the request omits the parameter and behaves as today.
3. The frontend supplies the best available location (current map center → GPS → fleet config center); the suggest query re-runs when the (rounded) location changes, and the two-tier geo cache keys results per location.
4. No change to the suggest route/verb/policy/result shape; degradation and rate limiting are unchanged.
5. Quality gates green: backend `dotnet build -warnaserror` + `dotnet test` (user-local SDK; Docker up); web `tsc` + `lint` (0 warnings) + `vitest` + `build` + `size`.
