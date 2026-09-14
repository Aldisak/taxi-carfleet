# Assignment 011 — Multilingual UI (6 languages) with an in-app language selector

Read `00-PROJECT-CONTEXT.md` first. Requires 02, 03 and 04 merged (the dispatcher web app, driver PWA, customer PWA — all three are done). This assignment is **frontend-only** (`/web`); it does not touch the API, the database, SMS/push content, or any server-side text.

## Why

The app today ships two locales (`cs`, `en`) but has **no way for a user to change language** — `lng` is hard-coded to `cs` in `web/src/shared/i18n/index.ts`. Real fleets employ drivers and serve customers who read Ukrainian, Russian, Filipino and German far more comfortably than Czech. We want the whole UI to switch language instantly from an in-app selector, with translations shipped as **static per-culture JSON** so adding a language later is a drop-in file plus one config line — no build tooling, no runtime translation service, no API calls.

The i18n stack is already **i18next + react-i18next** with a single `translation` namespace and nested JSON (1,116 keys). Every user-facing string already goes through `useTranslation()`/`t()` (enforced by `rules/web-react-style.md#i18n-czech-first`), so switching language is a matter of loading more locales and calling `i18n.changeLanguage(...)` — react-i18next re-renders all consumers automatically.

## Goal

Six selectable languages — **Czech, English, Russian, Ukrainian, Filipino, German** — each backed by a complete, static, culture-coded JSON file. A shared, accessible language selector in all three clients switches the entire UI with no page reload and remembers the choice. On first visit the app auto-detects the browser language (falling back to Czech). Adding a seventh language later = add one JSON file + one registry entry + one import.

## Scope

**In:** six culture-coded locale JSON files (four newly, fully translated); a locale registry as the single source of truth; i18n config rewrite driven by that registry; browser-language detection + persistence of the user's choice; one shared `LanguageSelector` component placed in all three clients; generalizing the locale parity test to N locales; pinning the Playwright locale; setting `<html lang>` on switch; small doc updates.

**Out:** right-to-left support (none of the six languages are RTL); translating any server-side content — API responses, error-code *values*, SMS bodies, push payloads, seeded data (only their client-side i18n *presentation* is translated); changing money or date/time formatting (see the non-goal below); adding a language-preference column to the backend/user profile (the choice lives in the browser).

**Non-goal — formatting stays Czech:** money is integer CZK formatted `cs-CZ` (`1 200 Kč`) and dates render in `Europe/Prague`, per `rules/web-react-style.md#dates-and-money`. These do **not** change with the UI language. `web/src/shared/format/money.ts` and the date helpers stay `cs-CZ`/Prague in every language.

## 1. Locale codes, registry, and files

Use **full culture codes**: `cs-CZ`, `en-US`, `ru-RU`, `uk-UA`, `fil-PH`, `de-DE`.

- Rename the two existing files: `web/src/shared/i18n/cs.json → cs-CZ.json`, `en.json → en-US.json`. Update the imports in `index.ts` and in the parity test.
- Add four new files: `ru-RU.json`, `uk-UA.json`, `fil-PH.json`, `de-DE.json` (see §5).
- Create `web/src/shared/i18n/locales.ts` as the **single source of truth**:

```ts
export const SUPPORTED_LOCALES = [
  { code: 'cs-CZ', nativeName: 'Čeština' },
  { code: 'en-US', nativeName: 'English' },
  { code: 'ru-RU', nativeName: 'Русский' },
  { code: 'uk-UA', nativeName: 'Українська' },
  { code: 'fil-PH', nativeName: 'Filipino' },
  { code: 'de-DE', nativeName: 'Deutsch' },
] as const

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code']
export const DEFAULT_LOCALE: LocaleCode = 'cs-CZ'
```

**Extensibility contract (must hold and be documented):** adding a language is exactly (1) drop in a `xx-YY.json` with the same key set, (2) add one entry to `SUPPORTED_LOCALES`, (3) add one `import` + resources line in `index.ts`. The selector, config, detection, and parity test all derive from `SUPPORTED_LOCALES` — nothing else changes.

## 2. i18n configuration (`web/src/shared/i18n/index.ts`)

Rewrite so `resources` is built from the six imported JSONs keyed by their culture codes. Init with:
- `lng: DEFAULT_LOCALE` (a **static** default — do **not** put browser detection here; see §3 and §6),
- `fallbackLng: 'en-US'`,
- `supportedLngs: SUPPORTED_LOCALES.map(l => l.code)`,
- `interpolation: { escapeValue: false }` (unchanged).

The exported `i18n` singleton must keep resolving to Czech by default when imported in isolation (this is what preserves the unit-test baseline — §6).

## 3. Detection, persistence, and switching

- **Persistence** — new `web/src/shared/i18n/languageStorage.ts`, following the `web/src/features/driver/settings/driverSettings.ts` localStorage try/catch pattern. Key `app.language`. It must **not** live in `authStorage` (the choice survives logout). `getStoredLanguage(): LocaleCode | null` validates the stored value against `SUPPORTED_LOCALES`; `setStoredLanguage(code)`.
- **Resolution** — pure function `resolveInitialLanguage(navigatorLangs: readonly string[], stored: LocaleCode | null): LocaleCode`, order: stored → exact culture-code match → primary-subtag match (`de`→`de-DE`, `uk`→`uk-UA`, `ru`→`ru-RU`, `en`→`en-US`, `cs`→`cs-CZ`, `tl`/`fil`→`fil-PH`) → `DEFAULT_LOCALE`. Pure and unit-testable.
- **Apply on startup** — `applyInitialLanguage()` resolves against `navigator.languages` + stored, calls `i18n.changeLanguage(code)`, and sets `document.documentElement.lang`. It is called **once from `web/src/main.tsx`** (the browser entry) only — never from `index.ts`, so it never runs in unit tests.
- **Switching** — `useLanguage()` hook returning `{ current, setLanguage }`; `setLanguage(code)` calls `i18n.changeLanguage(code)`, `setStoredLanguage(code)`, and updates `document.documentElement.lang`. react-i18next re-renders every `t()` consumer → the whole UI switches with no reload.

## 4. The selector and where it goes

One shared component `web/src/shared/i18n/LanguageSelector.tsx`:
- A **styled native `<select>`** (accessible and mobile-friendly; mirror the existing `web/src/features/driver/home/VehicleSelector.tsx` pattern), one `<option>` per `SUPPORTED_LOCALES` entry showing `nativeName`, `value = i18n.language`, `onChange → useLanguage().setLanguage`.
- Accessible name via `aria-label={t('common.language')}` (add a new `common.language` key to **all six** locale files). Touch target ≥ 48 px per `rules/web-accessibility.md`. Ships a vitest-axe test.

Placement (uses the one component):
- **Dispatcher** — `web/src/app/AppLayout.tsx`: in `<Nav>`, before the mute/logout controls.
- **Driver** — `web/src/features/driver/settings/DriverSettingsPage.tsx`: a settings section (styled like `NavAppPreference.tsx`), not the bottom nav.
- **Customer** — `web/src/features/customer/shell/CustomerLayout.tsx`: in the header actions area, next to `CallButton`.

## 5. Translations

Deliver complete `ru-RU.json`, `uk-UA.json`, `fil-PH.json`, `de-DE.json` — **all 1,116 keys each**, translated from the `cs-CZ`/`en-US` source of truth. Rules:
- Preserve every `{{placeholder}}` verbatim — never translate the interpolation variable name.
- Do not localize brand/proper nouns and non-text tokens (app name, `SMS`, `PWA`, `Kč`, anything that looks like an error-code value).
- Match register/tone: **customer-facing = formal** (German `Sie`; formal Russian/Ukrainian), **driver-facing = informal** (German `du`; informal Russian/Ukrainian), mirroring the `cs` "vy"/"ty" split in `rules/web-react-style.md`.
- Identical key structure to `cs-CZ.json` — the parity test (§6) is the completeness gate.

These are machine/model-produced, native-quality translations; a **native-speaker review pass is recommended** before a real launch and should be tracked as a follow-up.

## 6. Test and e2e locale safety (must not regress the suite)

- **Unit tests** run in Czech by default and assert Czech strings. This is preserved because `index.ts` keeps a static `cs-CZ` default and detection runs only in `main.tsx`. Renaming to `cs-CZ` resources keeps the same Czech content. No change to `web/src/test-setup.ts` is expected.
- **Parity test** — generalize `web/src/shared/i18n/locales.parity.test.ts` from "cs vs en" to "**every** locale in `SUPPORTED_LOCALES` has a key set identical to `cs-CZ`" (loop over the registry, reuse the existing `flattenKeys`). Fails listing any missing/extra keys per locale.
- **Playwright** — add `use.locale: 'cs-CZ'` (top-level `use`) in `web/playwright.config.ts` so Chromium's `navigator.language` is `cs-CZ` and auto-detect keeps every existing e2e spec in Czech. Without this, detection flips e2e to en-US and breaks the Czech-string assertions.
- **New unit tests**: `resolveInitialLanguage` (exact match, primary-subtag match, stored-wins, unknown→`cs-CZ`, empty list); `languageStorage` (round-trip, invalid ignored, storage-throws safe); `LanguageSelector` (renders all six options, selecting calls change+persist, axe clean).

## 7. Documentation updates (part of this assignment)

- `rules/web-react-style.md#i18n-czech-first` and `00-PROJECT-CONTEXT.md`: note that supported locales are defined by `SUPPORTED_LOCALES`, the parity test now covers all of them, and money/date formatting stays `cs-CZ`/`Europe/Prague` regardless of UI language.
- `docs/decisions.md`: record the six-locale decision, the full-culture-code convention, and the auto-detect→Czech-fallback behavior.

## Acceptance criteria

1. All six locales are key-complete and identical: the generalized parity test passes and fails loudly if any locale is missing or has an extra key.
2. Picking a language in the selector re-renders the **entire** visible UI into that language **without a page reload**; reloading the page keeps the chosen language (persisted in `localStorage`).
3. With no stored choice, a browser whose language is German (or Russian/Ukrainian/Filipino) opens the app in that language; an unsupported browser language opens in Czech.
4. The selector is present and reachable in all three clients (dispatcher header, driver settings, customer header), has an accessible label, meets the 48 px touch target, and passes its vitest-axe check.
5. `<html lang>` reflects the active language after switch and on load.
6. Money still renders `… Kč` (`cs-CZ`) and dates still render in `Europe/Prague` in **every** UI language.
7. Quality gates green: `npm run tsc`, `npm run lint` (0 warnings), `npx vitest run` — including the ~1,400 existing tests, which remain in Czech and unaffected — and `npm run e2e` (Playwright), which stays in Czech via the pinned locale.
8. Adding a hypothetical seventh locale requires only: a new `xx-YY.json`, one `SUPPORTED_LOCALES` entry, and one import/resources line in `index.ts` — demonstrated by the fact that the selector, detection, and parity test read the registry (no other code references individual locale codes).
