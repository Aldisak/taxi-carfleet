# Web Performance Rules

## Memoization policy

No `useMemo`, `useCallback`, or `React.memo` without a **measured** re-render problem (React DevTools Profiler evidence or a failing render-count test). Record the measurement in the work-item handoff `notes`. Fix causes before adding caches: unstable dependencies, inline object/array literals passed as props, state lifted higher than its consumers need.

Anti-pattern: wrapping every callback in `useCallback` "for performance" — it adds allocation + comparison cost and hides real dependency bugs.

## Query keys

TanStack Query keys are hierarchical arrays: `['orders', 'list', filters]`, `['orders', 'detail', id]`, `['drivers']`. Patch or invalidate the **exact** key; never call `invalidateQueries()` without a key (refetches the world). Realtime handlers prefer patching over invalidation (rules/web-realtime.md#cache-patch-not-refetch).

## Virtualization

Any list that can realistically exceed ~100 rendered rows (order search results, event timelines, large fleets) uses `@tanstack/react-virtual`. Below that threshold, plain `.map()` — do not pre-virtualize the three-car board.

## Code splitting

Role route groups (`/x`, `/d`, `/c`) are lazy-loaded at the router with `React.lazy` so no client downloads another role's bundle. Heavy dependencies (Leaflet) load only inside the chunks that use them.

## Bundle budget

`npm run size` (size-limit, budgets in `web/package.json` under `"size-limit"`) must pass after `npm run build`. Raising a budget requires a `docs/decisions.md` entry with the reason. Check the budget whenever a work item adds a dependency or a new route chunk.

## Web vitals

`src/shared/perf/reportWebVitals.ts` reports CLS/INP/LCP/TTFB/FCP (dev: console; production sink comes with assignment 07 observability). Keep interactions under the INP threshold: no synchronous work >50 ms in event handlers. No spinner longer than 1 s without a message (spec §11).

## High frequency events

High-frequency streams (driver positions every ~3 s per driver) never call `setState` per event unthrottled. Throttle at the consumer — `features/board/markerThrottle.ts` is the pattern — or batch into the Zustand position store and let subscribers sample. One SignalR event must never trigger a render of the whole board.
