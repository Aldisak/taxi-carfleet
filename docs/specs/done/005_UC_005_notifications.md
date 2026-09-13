# UC-005 — Notifications (SMS + Web Push)

- **Sequence:** 005
- **Stack:** mixed — backend-heavy (`/api`: notification engine, outbox job, SMS/push adapters, templates, cost cap, delivery log, subscriptions) + small frontend (`/web`: dispatcher order-detail "Notifikace" section + failed-SMS red icon; service-worker push display + click; subscription wiring for driver/customer)
- **Complexity tag:** novel (transactional outbox + background dispatch job, VAPID Web Push, GSM-7 template validation, per-fleet monthly cost cap, dedup unique-index, data-driven routing matrix)
- **Mode:** autonomous batch run (standing user directive renewed 2026-09-12: gates A–E pre-approved, parallel lanes, backend-developer (api) / frontend-developer (web) agents, interrupt only on 3-round blocks / quality-gate failures / undecidable scope. No git remote → ship = local commit on a feature branch; no push/PR).
- **Sources of truth:** `.claude/state/00-PROJECT-CONTEXT.md` (§4 stack, §6 conventions, §7 multi-tenancy, §8 state machine, §10 SignalR, §11 UX), `.claude/state/05-notifications.md` (engine/channels/templates/cost/visibility/subscriptions/ACs — authoritative, do not restate), `docs/api.md`, `docs/decisions.md`, CLAUDE.md facts.

## Title

The right person learns about the right event at the right time at minimal cost: a transactional-outbox notification engine with a data-driven routing matrix, Web Push (free, preferred) + SMS (cost-gated) channels, Czech GSM-7 templates, per-fleet monthly SMS cost cap, a delivery log the dispatcher can see, and push-subscription management. Resolves the deferred push halves of UC-003 AC#3 (background offer push) and UC-004 (customer push-subscription server side).

## Actors

- **System / OrderService** — calls `INotificationService.Notify(evt)` after each committed order transition (+ driver/dispatch flows); the `NotificationDispatchJob` drains the outbox.
- **Customer** — push (if subscribed) or SMS (phone orders, or no push) for the events that matter (OrderCreated tracking link, DriverArrived always).
- **Driver** — push offers (high-priority, requireInteraction + sound), assignment/cancel.
- **Dispatcher / FleetAdmin** — board sound + push for new-app/declined/timed-out/customer-cancel; sees the delivery log + failed-SMS red icon; cap warnings + monthly SMS count/cost.

## Preconditions

- UC-001/002/003/004/006 shipped (commit `51ab4c5`): backend 373 tests, web 940 unit + 10 e2e. Reuse/verify against SOURCE (do not assume): `OrderService.TransitionAsync` post-commit hook (where `OrderChanged`/`NewOrderOffered` are published — the Notify call site) + the transaction boundary (outbox row must be in the SAME transaction as the order change); `FleetSettings` (add SmsMonthlyCapCzk default 500, SmsUnitCostCzk default 1); `PushSubscription` entity (CLAUDE.md references one — confirm shape) + any existing push-subscription endpoint; the UC-003 `PermissionPriming` (driver) + UC-004 customer push-prompt (client subscription); the UC-004 tracking token/link for SMS; the background-job pattern (`OfferTimeoutJob`/`StalePositionJob` — `RunTickAsync` testable shell, CLAUDE.md WI-14); the fleet slug + `Order.Source` (Phone vs App) field.

## Main flow (system level)

**Lane A — backend (api/, the bulk):**
1. **Engine** `Features/Notifications`: `INotificationService.Notify(NotificationEvent evt)` + the `NotificationEvent` enum (OrderCreatedForCustomer, DriverAssigned, DriverArrived, RideStarted, RideCompleted, OrderCancelledByFleet, OrderCancelledByCustomer, OfferToDriver, DriverDeclined, DriverTimedOut, NewAppOrderForDispatch, ScheduledOrderReminder). Data-driven routing matrix (static per-event recipient/channel table per the assignment §1 grid; phone-order subset: OrderCreated + DriverArrived SMS only). Resolves recipients → writes `notification_outbox` rows IN THE SAME TRANSACTION as the order change (transactional outbox). Dedup: unique index on `notification_log(event, order_id, recipient, channel)` — same event+order+recipient+channel never sent twice.
2. **Channels**: `ISmsSender` — `GoSmsSender` (HTTP, <80 lines) + `ConsoleSmsSender` (config-selected) + a second provider (SMSbrána) behind config, untested-against-live. `IPushSender` (WebPush lib + VAPID; 410 Gone → delete subscription; payload ≤3 KB {title,body,url,tag,priority}). `NotificationDispatchJob` drains `notification_outbox`, retries 3× with backoff, then `Failed`; writes `notification_log`.
3. **Templates**: Czech `Templates/cs/*.txt` with placeholders; SMS ≤160 GSM-7 chars (no diacritics) validated by a build-time test with longest realistic values (30-char fleet, 6-digit code); push title/body may use diacritics. OrderCreated/DriverArrived SMS + DriverAssigned push per assignment §3; tracking link from UC-004 token.
4. **Cost control**: FleetSettings.SmsMonthlyCapCzk (500) + SmsUnitCostCzk (1); per-fleet-per-month counter; 90% → push FleetAdmin; 100% → skip SMS EXCEPT DriverArrived, log `SkippedCap`.
5. **Visibility + subscriptions**: `notification_log` (Id, FleetId, Event, OrderId, Channel, Recipient, Status Queued/Sent/Failed/Skipped*, ProviderMessageId, Error, CreatedAt, SentAt). `POST/DELETE /api/v1/push/subscriptions` (all roles, multi-device, prune on 410 + 90-day unused). Order-detail response gains a Notifikace list (sent/failed).

**Lane B — frontend (web/, small):**
6. **Dispatcher** (/x): order-detail "Notifikace" section (sent/failed items); a failed-SMS red icon on the order card so the dispatcher calls the customer; cap warning + monthly SMS count/cost in settings.
7. **Service worker + subscription**: the `/web` service worker shows the push notification and opens `url` on click; `OfferToDriver` uses `requireInteraction: true` + the driver sound. Wire the driver (mandatory at login, UC-003 priming) + customer (after first order, UC-004 prompt) push-subscription POST/DELETE to the new endpoint. Board sound for dispatcher events (reuse UC-002 sound infra).

## Acceptance criteria

The 7 in `.claude/state/05-notifications.md` are binding: (1) Phone-order → exactly one SMS with a working tracking link (ConsoleSmsSender asserted); (2) DriverArrived SMS even when push exists, RideStarted push-only; (3) outbox row in the same transaction, 3× fail → Failed + dispatcher red icon; (4) push 410 → subscription deleted; (5) every SMS template ≤160 GSM-7 with longest values; (6) cap=2 → third non-arrival SMS SkippedCap, arrival still sends; (7) duplicate Notify → sent once.

## Out of scope

Email, in-app chat, marketing. Live SMS-provider testing (adapters behind config, GoSms/SMSbrána untested against live API). Assignment 07 (reports/audit), 08 (infra — VAPID/provider keys wiring documented, prod secrets deferred to 08).

## Non-functional requirements

- Multi-tenancy: notification_outbox/notification_log/push_subscription FleetId-scoped (or UserId-scoped where appropriate like PushSubscription — mirror RefreshToken); tenant-isolation integration test. Transactional outbox is load-bearing (AC#3) — the outbox insert shares the order-change transaction.
- Conventions: `.claude/rules` (api-design REPR, vertical slices, ef-core, error-handling, validation, csharp-style, logging — notifications must log per rules/logging.md with Reason/Phase discriminators, never raw tokens/phone in logs beyond what's needed); background job follows the `RunTickAsync` testable-shell pattern (CLAUDE.md WI-14); TimeProvider for the monthly-cap window + retry backoff; money integer CZK; web rules for the small UI.
- Quality gate (blocking): api build -warnaserror + test; web lint (--max-warnings 0) + tsc + test + build + size; playwright only if a web user-flow changed (the dispatcher Notifikace section is mostly component-tested; e2e optional). Informational: format.

## Notes for the designer

- Split Lane A (api, the bulk) + Lane B (web, small) WIs with lane + depends_on, topologically ordered. The transactional outbox (AC#3) + the Notify call-site inside `OrderService.TransitionAsync`'s existing transaction is the novel risk — investigate where the order-change transaction commits and ensure the outbox insert is inside it (not a post-commit side effect like the SignalR publish). Migrations: notification_outbox + notification_log + push_subscription(if new) + FleetSettings cap columns — serialize migration-adding WIs via depends_on (one coherent snapshot, UC-004/006 precedent).
- The routing matrix is a static in-code table (assignment §1) — model it so a per-fleet override is easy later but don't build the override UI now. Dedup unique index + the cap counter + the GSM-7 build-time template test are each explicit ACs — make them test-first.
- Carry forward review lessons: tenant/own-row isolation test per feature; client.ts named-envelope unwrap (the Notifikace list + subscription responses); the WebPush NuGet must be engine/version-checked (note any pin); VAPID + provider keys are dev-config only (prod → 08, document). Resolve the UC-003 AC#3-background + UC-004 push-subscription-server deferrals here and note it in decisions.md.
