# Web Architecture Rules

Apply to everything under `web/`. One React SPA/PWA codebase serves three role-based clients: dispatcher (`/x`), driver (`/d`), customer (`/c`). No SSR, no SEO — do not propose Next.js or server rendering.

## Feature folders

Every feature is a vertical slice under `src/features/<feature>/` — screens, hooks, api-calling hooks, pure logic, and their tests co-located (`src/features/board/` is the reference). Shared code lives only in `src/shared/{api,i18n,map,realtime,sound,theme}` and `src/app` (router, providers, layouts).

**No cross-feature imports.** A module in `features/orders/` never imports from `features/board/`. Code needed by 2+ features gets promoted to `src/shared/`.

## Route groups

Role prefixes are hard boundaries: `/x/*` dispatcher, `/d/*` driver PWA, `/c/*` customer PWA. Routes and layouts live in `src/app/router.tsx`. A work item scoped to one role group must not modify another group's routes or screens.

## Api client

All HTTP goes through typed functions in `src/shared/api/client.ts`. DTO types mirror the backend JSON contract (camelCase). API error codes are stable `"{Domain}.{ErrorName}"` strings used directly as i18n keys. No `fetch`/`axios` anywhere outside the client module.

## State tiers

| State | Lives in |
|-------|----------|
| Server data (orders, drivers, settings) | TanStack Query — the only cache for server state |
| Tiny cross-cutting client state (live driver positions) | Zustand (`src/shared/realtime/usePositionStore.ts` is the precedent) |
| Local UI state (open drawer, form input) | `useState` / `useReducer` in the component |

Never mirror server state into Zustand or module globals — one source of truth per datum. Realtime events update the TanStack cache (rules/web-realtime.md#cache-patch-not-refetch), not a parallel store.

## Pure logic modules

Extract decision logic into pure, colocated `.ts` modules with their own tests — `statusPill.ts`, `sectionBucketing.ts`, `elapsedTimer.ts`, `markerThrottle.ts` in `features/board/` are the pattern. Components render; pure modules decide. This is what makes unit-first TDD possible (rules/web-testing.md#test-ordering).

## Banned patterns

NO: component libraries (MUI, Ant, Chakra…) — headless primitives are the only exception, and only when a spec calls for one.
NO: Tailwind or any CSS framework — styling is styled-components with theme tokens (rules/web-react-style.md#styled-components, decision 2026-09-11).
NO: Redux, MobX, Recoil, Jotai — the three tiers above cover everything.
NO: SSR/Next.js/Remix — pure SPA + PWA.
NO: new module-level singletons — the SignalR hub connection (rules/web-realtime.md#single-hub-singleton) is the one documented exception.
