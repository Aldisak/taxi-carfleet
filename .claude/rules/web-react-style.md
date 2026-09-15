# Web React & TypeScript Style Rules

## Styled components

All styling via `styled.*` using theme tokens from `src/shared/theme/theme.ts` (`theme.colors`, `theme.spacing`, `theme.typography`, `theme.borderRadius`, `theme.shadows`). No hardcoded colors or magic px values in style bodies.

Style-only props use the transient `$` prefix so they never reach the DOM:

```tsx
const Card = styled.article<{ $highlighted: boolean }>`
  background: ${({ theme, $highlighted }) =>
    $highlighted ? theme.colors.primaryLight : theme.colors.surface};
`
```

Anti-pattern: `styled.div<{ highlighted: boolean }>` (leaks a non-DOM attribute, React warning) or `background: #fff` (bypasses the theme).

## Component conventions

Function components + hooks only. Files: `PascalCase.tsx` for components, `camelCase.ts` for logic/hooks; hooks named `useXxx`. One exported component per file. Components stay presentational — decisions go to pure logic modules (rules/web-architecture.md#pure-logic-modules).

## Typescript strict

`strict: true` is on and stays on. No `any` (use `unknown` + narrowing). Exported functions and hooks have explicit return types where inference is not obvious. UI state machines are discriminated unions, not booleans:

```ts
type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'disconnected'
```

## I18n czech first

Every user-facing string — including `aria-label`, `alt`, placeholders, button text, error messages — goes through `useTranslation()`. Czech (`cs-CZ`) is the default; English (`en-US`) is the fallback.

The set of supported UI languages is defined once by `SUPPORTED_LOCALES` in `src/shared/i18n/locales.ts` (full culture codes: `cs-CZ`, `en-US`, `ru-RU`, `uk-UA`, `fil-PH`, `de-DE`). The selector, i18n config, browser detection, and parity test all derive from that registry — never reference a language by a bare code literal in feature/component code (`extensibility.test.ts` fails the suite if one leaks in). Adding a language is exactly: one `xx-YY.json`, one `SUPPORTED_LOCALES` entry, one import + resources line in `index.ts`.

Every new key is added to **all** locale JSONs (`cs-CZ.json`, `en-US.json`, `ru-RU.json`, `uk-UA.json`, `fil-PH.json`, `de-DE.json`) in the same change — `src/shared/i18n/locales.parity.test.ts` iterates the exported resources map and fails the suite on any key-set mismatch against `cs-CZ`.

Formatting is a non-goal of localization: money stays `cs-CZ` (`… Kč`) and dates stay `Europe/Prague` in **every** UI language (`money.ts` `Intl.NumberFormat('cs-CZ')`, date helpers). Those `cs-CZ` formatting literals are correct and are exempt from the extensibility scan — do not "fix" them to the active UI language. `formatStaysCs.test.ts` guards this.

Tone: formal "vy" for customers, informal "ty" for drivers (spec §11). API error codes (`Order.StaleVersion`) map to i18n keys; errors shown to users are human sentences — never raw codes, JSON, or stack traces.

Anti-pattern: `<button aria-label="Ztlumit">` hardcoded — use `t('board.mute')`.

## Dates and money

API timestamps are UTC ISO strings; format for display in `Europe/Prague` at render time (`Intl.DateTimeFormat` / date helpers). Money is integer CZK end-to-end — no floats, no decimal conversion in the client; format with `Intl.NumberFormat('cs-CZ')` at render only.
