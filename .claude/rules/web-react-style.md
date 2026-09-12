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

Every user-facing string — including `aria-label`, `alt`, placeholders, button text, error messages — goes through `useTranslation()`. Czech (`cs`) is the default; English is the fallback. Every new key is added to **both** `src/shared/i18n/cs.json` and `en.json` in the same change — `src/shared/i18n/locales.parity.test.ts` fails the suite on any key-set mismatch.

Tone: formal "vy" for customers, informal "ty" for drivers (spec §11). API error codes (`Order.StaleVersion`) map to i18n keys; errors shown to users are human sentences — never raw codes, JSON, or stack traces.

Anti-pattern: `<button aria-label="Ztlumit">` hardcoded — use `t('board.mute')`.

## Dates and money

API timestamps are UTC ISO strings; format for display in `Europe/Prague` at render time (`Intl.DateTimeFormat` / date helpers). Money is integer CZK end-to-end — no floats, no decimal conversion in the client; format with `Intl.NumberFormat('cs-CZ')` at render only.
