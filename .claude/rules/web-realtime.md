# Web Realtime Rules

SignalR is the realtime backbone. The canonical implementation is `src/shared/realtime/` (`useFleetHub.ts`, `hubClient.ts`, `eventReducer.ts`, `reconnectBackoff.ts`).

## Single hub singleton

Exactly one `/hubs/fleet` connection per session — the module-level singleton in `useFleetHub.ts` (the documented exception to the no-singletons rule). Never build a second `HubConnection`; components consume connection state via the exported hooks (`useHubConnectionState`), never the raw connection.

## Cache patch not refetch

Event handlers update TanStack Query caches **in place**: `setQueryData` when the entity exists in a cache, invalidate only the exact affected key when it does not. The `OrderChanged` handler loop in `useFleetHub.ts` is canonical. Never blanket-`invalidateQueries()` per event — with a busy fleet that is a refetch storm that floods the API and repaints the board.

## Stale event guard

Events can arrive out of order after reconnects. Any handler for a versioned entity compares the incoming `version` against the cached one and drops stale events — the version map in `eventReducer.ts` is the pattern. Never apply an event with `version <= cached.version`.

## Reconnect catchup

Missed events are unrecoverable, so on `onreconnected` (and on cold-start connect success) invalidate the root query keys **once** to resync. Backoff schedule lives in `reconnectBackoff.ts` and is shared by cold-start retry — `withAutomaticReconnect` only engages after a first successful connect, so cold-start failures need their own retry loop (already implemented; reuse it).

## Offline ux

Server-mutating actions (create/assign/cancel order, accept/decline offer) are gated on connection state via `isServerActionBlocked` — blocked while `disconnected`/`reconnecting`, with a visible reason. Per spec §11, actions that are safe to retry (driver status updates) queue in IndexedDB and replay on reconnect; the idempotency key is minted **at enqueue time**, not at send time, so replays are deduplicated server-side. Accept/decline of an offer is never queued — a stale accept is worse than a failed one.

## Last known state

Every screen renders the last known data plus an offline banner (`features/board/DisconnectBanner.tsx` pattern, `role="alert"`) — never a blank screen or a spinner while disconnected (spec §11). Reads keep working from cache; only mutations are blocked or queued.
