# Assignment 05 — Notifications (SMS + Web Push)

Read `00-PROJECT-CONTEXT.md` first. Requires 01–04 merged.

## Goal

The right person learns about the right event at the right time, at minimal cost.
**Push is free — prefer it. SMS costs money — send only when it matters and push is unavailable.**

## Scope

**In:** notification engine, templates (Czech), SMS provider adapter, Web Push service, subscription management,
delivery log, per-fleet cost cap, dispatcher visibility of failures.
**Out:** email, in-app chat, marketing messages.

## Design

### 1. Notification engine (`/Features/Notifications`)
- `INotificationService.Notify(NotificationEvent evt)` called by `OrderService` after each committed transition and by driver/dispatch flows.
- Events (enum): `OrderCreatedForCustomer`, `DriverAssigned`, `DriverArrived`, `RideStarted`, `RideCompleted`, `OrderCancelledByFleet`, `OrderCancelledByCustomer`, `OfferToDriver`, `DriverDeclined`, `DriverTimedOut`, `NewAppOrderForDispatch`, `ScheduledOrderReminder` (T-30 min to dispatch, T-15 min to driver).
- Routing table (data-driven, in code as a static matrix, overridable per fleet later):

| Event | Customer | Driver | Dispatcher |
|---|---|---|---|
| OrderCreatedForCustomer | Push; **SMS if no push subscription** (contains tracking link) | – | – |
| DriverAssigned | Push; SMS if no push (driver name, plate, ETA, link) | – | – |
| DriverArrived | Push; **SMS always** (this is the one that matters most) | – | – |
| RideStarted | Push only | – | – |
| RideCompleted | Push only (with rating link) | – | – |
| OrderCancelledByFleet | Push; SMS if no push | – | – |
| OrderCancelledByCustomer | – | Push | Push + sound in board |
| OfferToDriver | – | Push (high priority) + SignalR | – |
| DriverDeclined / TimedOut | – | – | Push + board sound |
| NewAppOrderForDispatch | – | – | Push + board sound |
| ScheduledOrderReminder | – | Push | Push |

- Phone orders (Source=Phone, no customer app): customer gets SMS for `OrderCreated` (with tracking link) and `DriverArrived` only. This is the minimum that makes the phone customer feel the difference vs. competitors.
- Deduplication: same event + same order + same recipient never sent twice (unique index on `notification_log(event, order_id, recipient_user_id or phone, channel)`).

### 2. Channels
- `ISmsSender` implementations: `GoSmsSender` (HTTP), `ConsoleSmsSender`. Config selects one. Provider adapter must be < 80 lines; adding a second provider (SMSbrána) must be trivial — write it too, behind config, untested against live API.
- `IPushSender` using `WebPush` library with VAPID. Handle `410 Gone` → delete subscription. Payload ≤ 3 KB: `{ title, body, url, tag, priority }`. Service worker in `/web` shows the notification and opens `url` on click; for `OfferToDriver` use `requireInteraction: true` and the driver app's sound.
- Sending happens in a background `NotificationDispatchJob` reading a `notification_outbox` table (transactional outbox: the outbox row is inserted in the same transaction as the order change). Retry 3× with backoff; then mark `Failed`.

### 3. Templates
- Czech, in `Templates/cs/*.txt` with placeholders. SMS max 160 chars (GSM-7) — validate at build time with a test. Examples to implement:
  - OrderCreated (SMS): `Taxi {fleet}: objednavka {code} prijata. Sledujte: {link}` (no diacritics in SMS to stay GSM-7).
  - DriverArrived (SMS): `Taxi {fleet}: ridic {driver} je na miste, {plate} {color}.`
  - DriverAssigned (push title/body): `Řidič přijede za ~{eta} min` / `{driver}, {plate} {color}`.
- Tracking link uses the token from 04.

### 4. Cost control
- `FleetSettings.SmsMonthlyCapCzk` (default 500) and `SmsUnitCostCzk` (default 1). Counter per fleet per month. When 90 % reached → push to FleetAdmin; at 100 % → SMS is skipped except `DriverArrived`; log `SkippedCap`.
- Dispatcher settings show current month SMS count and estimated cost.

### 5. Visibility
- `notification_log` table: `Id, FleetId, Event, OrderId, Channel, Recipient, Status (Queued/Sent/Failed/Skipped*), ProviderMessageId, Error, CreatedAt, SentAt`.
- Order detail (02) gets a "Notifikace" section listing sent/failed items. Failed SMS shows a red icon on the order card so the dispatcher can call the customer instead.

### 6. Subscription management
- `POST/DELETE /api/v1/push/subscriptions` for all roles. One user may have several devices. Prune on 410 and after 90 days unused.
- Customer PWA: prompt after first order (04). Driver PWA: mandatory at login (03).

## Acceptance criteria

1. Integration test: creating a Phone-source order enqueues exactly one SMS with a working tracking link; ConsoleSmsSender output is asserted.
2. Driver arrival sends SMS to the customer even if a push subscription exists; ride start sends only push.
3. Outbox row is written in the same transaction; if the send fails 3×, status is `Failed` and the dispatcher board shows the red icon.
4. Push to a subscription returning 410 deletes the subscription.
5. Every SMS template fits 160 GSM-7 characters with the longest realistic values (test with a 30-char fleet name and 6-digit code).
6. Monthly cap: with cap set to 2, the third non-arrival SMS is `SkippedCap`, the arrival SMS still goes.
7. Duplicate event delivery (call `Notify` twice) sends once.
