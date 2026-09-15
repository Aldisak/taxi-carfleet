# Assignment 012 — SuperAdmin per-tenant settings editor (incl. encrypted Mapy keys)

Read `00-PROJECT-CONTEXT.md` first. Requires 001 (backend core, multi-tenancy + `FleetSettings`), 002 (dispatcher web app + `/admin` area), 007 (SuperAdmin onboarding: create/list/deactivate fleets), and 010 (Mapy geo integration + `FleetKeyProtector`) — all merged. This assignment spans **both lanes**: the API (`/api`) gains two SuperAdmin endpoints and a resilience fix; the dispatcher web app (`/web`) gains a per-tenant settings editor under `/admin`.

## Why

Per-fleet Mapy.com keys (and the other tenant-configurable parameters) are stored **encrypted at rest** in `fleet_settings` via ASP.NET Data Protection (`Taxi.Api.Common.Security.FleetKeyProtector`, purpose `"FleetSettings.MapyKeys"`). There is currently **no UI or endpoint to set these keys protected** — the intended per-tenant configuration path was never built. An operator who pastes a **raw** (unprotected) key straight into the column causes `FleetKeyProtector.Unprotect` to throw `System.Security.Cryptography.CryptographicException`, which surfaces as an HTTP 500 from the anonymous `GET /geo/config` (`GeoConfigEndpoint.cs`) — breaking the map for the whole fleet.

A fleet also has many other tenant-configurable parameters (offer timeout, auto-dispatch, SMS caps, map center/zoom, geo budget, branding) that today can only be partly edited by a FleetAdmin (`PUT /fleet/settings`, a limited subset) and cannot be edited by the platform SuperAdmin at all. The platform operator needs one place to configure everything for any tenant.

## Goal

A **SuperAdmin-only per-tenant settings editor** in the existing `/admin` area. Each fleet row on `/admin` gets an **"Edit" action** that opens a settings page (`/admin/fleets/:fleetId/settings`) where the operator can view and save **all Fleet + FleetSettings parameters for that tenant**, including the **Mapy server and browser keys**. Keys are **encrypted server-side** on save via `IFleetKeyProtector`. The secret **Mapy server key is never returned to the browser** (write-only field + a "configured" indicator). Saving is instant, validated, and accessible. As a side effect, the geo config path is made **resilient to un-decryptable/legacy raw values** so a bad key degrades to the configured fallback instead of 500.

## Scope

**In:** two new SuperAdmin API endpoints (`GET`/`PUT admin/fleets/{id}/settings`) with a request validator; server-side encryption of Mapy keys on write and a write-only contract for the server key; a `TryUnprotect` resilience fix in `IFleetKeyProtector` used by `GeoConfigEndpoint` and `MapyKeyResolver`; a new web settings page + form module + hooks reached from an "Edit" button on `AdminFleetsPage`; a new `/admin/fleets/:fleetId/settings` route under `AdminGuard`; new i18n keys in all six locale files; backend + frontend tests; OpenAPI allowlist + `docs/api.md` regeneration; a `docs/API-KEYS.md` update.

**Out:** editing the default **Tariff** / pricing (base fare, per-km, etc.) — a separate follow-up; letting **FleetAdmins** edit Mapy keys (kept SuperAdmin-only — Mapy usage is billed at the platform level); any new DB migration (all target columns already exist on `Fleet`/`FleetSettings`); a database-backed audit-log entry for settings edits (may be a follow-up); changing money/date formatting or the geo caching/rate-limiting behavior.

## 1. Backend — new Admin slices (`api/src/Taxi.Api/Features/Admin/`)

Follow the existing settings-endpoint shape in `Features/Fleet/UpdateFleetSettings/` and the SuperAdmin cross-tenant write pattern in `Features/Admin/CreateFleet/CreateFleetEndpoint.cs` / `DeactivateFleet/DeactivateFleetEndpoint.cs`. Both endpoints are `internal sealed`, `DontCatchExceptions()`, and `Policies(nameof(AuthorizationPolicies.SuperAdminOnly))`.

### 1.1 `GetTenantSettings/` — `GET admin/fleets/{id:guid}/settings`

- `GetTenantSettingsEndpoint` + `GetTenantSettingsResponse`.
- Load `Fleet` + `FleetSettings` by id with `IgnoreQueryFilters()` + `AsNoTracking()` (SuperAdmin has null `CurrentTenant.FleetId`). 404 if the fleet does not exist.
- Response carries **all editable** fields:
  - Fleet: `name`, `phone`, `currency`, `timeZone`, `primaryColorHex`, `isActive`.
  - FleetSettings: `offerTimeoutSeconds`, `autoDispatchEnabled`, `autoDispatchAfterSeconds`, `maxOfferRadiusKm`, `smsSenderName`, `welcomeText`, `smsMonthlyCapCzk`, `smsUnitCostCzk`, `mapCenterLat`, `mapCenterLng`, `mapZoom`, `geoMonthlyCreditBudget`.
  - Mapy: `mapyBrowserKey` (public — decrypt with the new `TryUnprotect`; null if unset/undecryptable) and `mapyServerKeyConfigured: bool`. **The server-key value is never included in the response.**
- If the fleet has no `FleetSettings` row yet, return the entity defaults.

### 1.2 `UpdateTenantSettings/` — `PUT admin/fleets/{id:guid}/settings`

- `UpdateTenantSettingsEndpoint` + `UpdateTenantSettingsRequest` + `UpdateTenantSettingsValidator`.
- Load `Fleet` + `FleetSettings` by id (`IgnoreQueryFilters()`, tracked); **upsert** a `FleetSettings` row if missing (mirror `UpdateFleetSettingsEndpoint`). Assign all fields, then stamp `currentTenant.FleetId = id` **before** `SaveChangesAsync` (the one sanctioned cross-tenant write, per CLAUDE.md WI-04). Return `204 No Content`; 404 if the fleet does not exist.
- **Mapy key write semantics** (explicit keep/clear/set, applied to both `MapyServerKey` and `MapyBrowserKey`): request field `null` → leave the column unchanged; empty string `""` → clear the column to `null`; non-empty → store `keyProtector.Protect(value)`. This lets the write-only server-key field be left blank to preserve the existing key.
- **Never log** either Mapy key (rules/logging.md).
- Request DTO: plain `{ get; init; }` properties, **no `required`** (STJ 500-trap, CLAUDE.md WI-11). `mapCenterLat/Lng` are `double` in the JSON body (STJ invariant parsing — the FastEndpoints query-binding locale trap does not apply to body binding).

### 1.3 `UpdateTenantSettingsValidator`

Mirror `UpdateFleetSettingsValidator` and extend. Reuse existing `ErrorCodes.Validation.*` where they exist (`FleetNameRequired`, `PhoneRequired`, `PrimaryColorInvalid`, `OfferTimeoutRange`, `SmsCapNonNegative`, `WelcomeTextTooLong`); add new `ErrorCodes.Validation.*` for the rest in `Common/ErrorCodes.cs`. Rules:
- name required; phone required; timeZone required; currency 3-letter code.
- `primaryColorHex` matches `^#[0-9a-fA-F]{6}$` when non-empty.
- `offerTimeoutSeconds` 10..600; `autoDispatchAfterSeconds` ≥ 0; `maxOfferRadiusKm` 1..100.
- `smsMonthlyCapCzk` ≥ 0; `smsUnitCostCzk` ≥ 0; `smsSenderName` ≤ 100 when set; `welcomeText` ≤ 2000 when set.
- `mapCenterLat` −90..90; `mapCenterLng` −180..180; `mapZoom` 1..20; `geoMonthlyCreditBudget` ≥ 0.
- `mapyServerKey` / `mapyBrowserKey` ≤ 512 chars when set.

### 1.4 Resilience: `TryUnprotect` (fixes the current 500)

- Add `string? TryUnprotect(string?)` to `IFleetKeyProtector` and implement in `FleetKeyProtector` (`Common/Security/`): return `null` on `System.Security.Cryptography.CryptographicException` (and on null/empty input), otherwise the plaintext.
- Use `TryUnprotect` in `Features/Geo/Config/GeoConfigEndpoint.cs` (browser key) and `Infrastructure/Geo/MapyKeyResolver.cs` (server key) so an un-decryptable or legacy raw value falls back to the config value (`Mapy:BrowserKey` / `Mapy__ServerKey`) instead of throwing.

## 2. Frontend — the editor (`web/`, dispatcher `/admin` group)

Mirror the existing settings-form pattern in `web/src/features/settings/` (`FleetTab.tsx`, `fleetSettingsForm.ts`, `useFleetSettingsMutations.ts`) and the admin wiring in `web/src/features/admin/` (`useAdminFleets.ts`, `AdminFleetsPage.tsx`).

- **API client** (`web/src/shared/api/client.ts`): add `AdminTenantSettingsDto` (GET shape, with `mapyServerKeyConfigured: boolean` and no server-key value), `UpdateAdminTenantSettingsRequest` (PUT shape), `getAdminTenantSettings(fleetId)`, and `putAdminTenantSettings(fleetId, req)` — following the existing admin function pattern.
- **Hooks** (`web/src/features/admin/useAdminTenantSettings.ts`): `useAdminTenantSettings(fleetId)` (query key `['admin','fleets',fleetId,'settings']`) and `useUpdateAdminTenantSettings(fleetId)` (mutation; on success invalidate that key and `['admin','fleets']`).
- **Pure form module** (`web/src/features/admin/adminTenantSettingsForm.ts`): `AdminTenantSettingsFormValues` (number fields carried as strings like `fleetSettingsForm.ts`), `validateAdminTenantSettingsForm` (returns field→i18n-key map, mirrors the server validator), `toUpdateRequest`, and a `fromDto` seed helper.
- **Page** (`web/src/features/admin/AdminTenantSettingsPage.tsx`): grouped sections — **Fleet** (name, phone, currency, timeZone, brand color, active), **Dispatch** (offer timeout, auto-dispatch enabled + after-seconds, max offer radius), **SMS** (sender name, monthly cap, unit cost, welcome text), **Map & Mapy** (browser key, server key, center lat/lng, zoom), **Geo** (monthly credit budget). The server-key input is `type="password"`, left blank on load, showing a "configured / not set" hint from the DTO flag (blank submit = keep). Save banner `role="status" aria-live="polite"`; field errors `role="alert"` + `aria-invalid`; all strings via `t()`; touch targets ≥ 48 px. Ships a vitest-axe test.
- **Route** (`web/src/app/router.tsx`): add `/admin/fleets/:fleetId/settings` under `AdminGuard` via `lazyDispatch`, sibling to the existing `/admin` routes.
- **Entry point** (`web/src/features/admin/AdminFleetsPage.tsx`): add an "Edit" link/button per fleet row navigating to `/admin/fleets/${id}/settings`.

## 3. i18n

Add `admin.tenant.*` keys (section titles, every field label + helper hint, save/saving/saved/saveFailed, the Mapy key hints, and validation messages) to **all six** locale files — `cs-CZ`, `en-US`, `ru-RU`, `uk-UA`, `fil-PH`, `de-DE` — in the same change, with real translations (cs-CZ authoritative; customer-tone rules do not apply — this is an operator/admin screen, use neutral formal register). `web/src/shared/i18n/locales.parity.test.ts` gates key completeness.

## 4. Tests

Red-green-refactor per `rules/web-testing.md` and the backend TDD rules.

- **Backend integration** (`api/tests/Taxi.Api.Tests/Admin/`): SuperAdmin updates another fleet's settings → 204 and the row is changed; **Mapy round-trip** — after PUT with a plaintext key, the stored `MapyServerKey` ciphertext ≠ plaintext and `MapyKeyResolver.Resolve` returns the original plaintext (proves Protect+Unprotect through the real `IFleetKeyProtector`); the `GET` response contains the `mapyServerKeyConfigured` flag but **no server-key value**; blank server-key on PUT keeps the existing key; empty-string clears it; a FleetAdmin/driver token → 403; unknown fleet id → 404; invalid body → 400. A `TryUnprotect`/`GeoConfig` test: a row holding a raw (non-ciphertext) browser key no longer 500s `GET /geo/config` — it falls back.
- **Validator unit tests** (`.TestValidate(...)`), one case per rule/error-code.
- **OpenAPI allowlist**: add `GET /api/v1/admin/fleets/{id}/settings` and `PUT /api/v1/admin/fleets/{id}/settings` to the `expected` set in `api/tests/Taxi.Api.Tests/Seed/SeedAndEndToEndTests.cs`; the sibling test regenerates `docs/api.md` — stage it.
- **Frontend**: `adminTenantSettingsForm.test.ts` (pure validator + mappers), `AdminTenantSettingsPage.test.tsx` (seed from query, submit success + error banners, server-key write-only behavior, a11y axe) with `vi.mock('@/shared/api/client')`; i18n parity test runs automatically.

## 5. Documentation

Update `docs/API-KEYS.md` §1.3: replace the "no settings UI yet" note — Mapy keys are now set in **/admin → fleet → Edit**, encrypted server-side; keep the env/appsettings fallback as the alternative and the Data-Protection key-ring warning. Note the write-only server-key contract.

## Acceptance criteria

1. As a SuperAdmin, from `/admin` I can click **Edit** on a fleet, see that tenant's current settings, change any Fleet/FleetSettings field, and save — the change persists and re-opening the editor reflects it.
2. Pasting a Mapy **server** and **browser** key and saving stores them **encrypted**: the DB columns are ciphertext (≠ the pasted plaintext), and afterwards `GET /geo/config` returns the browser key and the backend can decrypt the server key for geo REST calls (address autocomplete / route ETA work). No `CryptographicException`.
3. The Mapy **server key value is never sent to the browser**: the `GET admin/fleets/{id}/settings` response and the network payload contain only a `mapyServerKeyConfigured` flag; the field loads blank; submitting it blank preserves the stored key.
4. A previously-stored **raw/undecryptable** value no longer 500s the map: `GET /geo/config` (and server-key resolution) degrade to the configured fallback via `TryUnprotect`.
5. Validation is enforced server-side (400 with stable error codes) and mirrored client-side (inline `role="alert"` messages, `aria-invalid`); the editor passes its vitest-axe check and meets the 48 px touch target.
6. Authorization holds: only a SuperAdmin token reaches the endpoints (FleetAdmin/driver/customer → 403); unknown fleet → 404; tenant isolation is respected (the write targets only the specified fleet).
7. New i18n keys exist in all six locales and the parity test passes.
8. Quality gates green: backend `dotnet build -warnaserror` + `dotnet test`; web `npm run tsc`, `npm run lint` (0 warnings), `npm run test`, `npm run build`, `npm run size`; the OpenAPI allowlist test passes and `docs/api.md` is regenerated and staged.
