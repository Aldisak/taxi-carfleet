# Web Testing Rules

## Test stack

Vitest 2 (jsdom, globals, `setupFiles: src/test-setup.ts`, `e2e/**` excluded — see CLAUDE.md), Testing Library + `user-event`, `vitest-axe`, `fake-indexeddb` for IndexedDB code. Playwright 1.48 for e2e: serial (1 worker), chromium only, `webServer` boots the real API harness + Vite.

## Red green refactor

The failing test exists **before** the implementation. Run it, read the failure output — a RED you did not observe does not count. Then minimum code to green, then refactor while green. One behavior per cycle.

## Test ordering

Pure logic modules → hooks (`renderHook`) → component render/interaction → a11y assertion → e2e. A new test that passes immediately is not exercising what you think — fix the test first. Most coverage belongs at the bottom of this ladder (pure logic), not the top.

## Colocation and naming

`foo.test.ts` beside `foo.ts`; `Component.test.tsx` beside `Component.tsx` (the `features/board/` tests are the reference). `describe` names the unit; `it` is a behavior sentence: `it('moves the order card when the driver accepts', ...)`.

## Queries over testids

Prefer `getByRole` / `getByLabelText` / `getByText` — assert what users perceive. Czech strings are the test default (cs is the default locale). `data-testid` is a last resort for elements with no accessible identity, and often signals a missing role or label — check rules/web-accessibility.md#semantics first.

## Timers and async

Countdown/throttle/debounce logic uses `vi.useFakeTimers()` + `vi.advanceTimersByTime(...)` (`markerThrottle.test.ts`, `elapsedTimer.test.ts` precedent). Never real sleeps. Always `await` `user-event` calls; prefer `findBy*` over `waitFor` + `getBy*`.

## Network mocking

Unit/component tests mock the api client module (`vi.mock('@/shared/api/client')`) — never real network, never `fetch` stubs scattered per test. SignalR logic is tested by invoking the reducer/handler functions directly (`eventReducer.test.ts`, `useFleetHub.test.ts` precedent) — never a live hub in unit tests. E2e uses the real API harness with seeded data.

## A11y assertion

The standard axe check on every new interactive component — always via the preconfigured helper (it disables `color-contrast` for jsdom, rules/web-accessibility.md#jsdom-limits):

```tsx
import { axe } from '@/shared/test/axe' // or the relative path

it('has no axe violations', async () => {
  const { container } = renderWithProviders(<OrderCard order={order} />)
  expect(await axe(container)).toHaveNoViolations()
})
```

## I18n parity

Every new i18n key lands in both `cs.json` and `en.json` in the same change — `src/shared/i18n/locales.parity.test.ts` fails the suite otherwise. Work items adding UI strings list both locale files in `files_touched`.

## E2e conventions

E2e covers the critical cross-role flows only (create order, driver accept, customer order) — don't write an e2e for what a component test proves. Specs are serial and share DB state; new role flows get their own spec file. `test-results/` and `playwright-report/` stay gitignored.
