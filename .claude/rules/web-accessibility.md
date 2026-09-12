# Web Accessibility Rules

Definition of Done includes Lighthouse accessibility ≥ 90 on every client. Accessibility is verified mechanically, not by intent.

## A11y gate

- Every **new interactive component** ships a vitest-axe assertion in its component test (rules/web-testing.md#a11y-assertion).
- `eslint-plugin-jsx-a11y` violations are blocking — `npm run lint` runs with `--max-warnings 0`. Disabling a rule inline requires a justification comment.
- Lighthouse a11y ≥ 90 is checked manually per UC (`npx lighthouse`) and recorded in `DEMO.md`.

## Semantics

Native elements first: `button` for actions, `a` for navigation, `article`/`nav`/`main` for structure (`OrderCard`'s `styled.article` is the precedent). Never `onClick` on a `div`/`span` without `role` + keyboard handling — prefer restyling a real `button`. Every form input has a label (`htmlFor` or wrapping `label`). Icon-only buttons get an i18n'd `aria-label`. Decorative icons get `aria-hidden="true"`. State is expressed with ARIA where the element doesn't already convey it: `aria-pressed`, `aria-expanded`, `aria-selected`, `role="alert"` + `aria-live="polite"` for banners.

## Keyboard focus

Every action reachable by keyboard; focus visible at all times (never `outline: none` without a replacement). Overlays (drawers, popovers, the driver offer takeover) trap focus while open, close on Escape, and return focus to the trigger. Modals have at most two buttons (spec §11). Shortcut keys (F2 → order form) must not shadow browser/AT defaults.

## Touch targets

Minimum touch target 48×48 px on all clients (spec §11). On mobile (driver/customer PWAs), the primary action is one big bottom button — thumb-reachable, ≥ 48 px tall. Spacing between adjacent targets ≥ 8 px.

## Jsdom limits

The axe `color-contrast` rule is disabled in jsdom test runs — contrast cannot be computed without real layout. Contrast is guaranteed by using approved theme token pairs (rules/web-react-style.md#styled-components) and verified by the manual Lighthouse check. Do not hand-roll colors to "fix" a contrast finding — fix the token pair.
