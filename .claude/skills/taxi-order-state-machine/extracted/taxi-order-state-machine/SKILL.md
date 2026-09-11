---
name: taxi-order-state-machine
description: "The single source of truth for taxi order lifecycle logic — statuses, allowed transitions, who may perform each, what each transition must record (order_events row) and broadcast (SignalR OrderChanged), plus timeouts, reassignment, cancellation and price-override rules. Use this whenever code touches an order's status: accept, decline, assign, reassign, arrive, start, complete, cancel, timeout, no-show, auto-dispatch, or any endpoint/job/UI that changes or displays order state. Trigger even if the user just says \"the driver should be able to X\" or \"when the customer cancels…\" — those are transitions."
---

# Taxi order state machine

Every order status change in the system goes through one class: `Domain/Orders/OrderStateMachine.cs`.
Handlers, jobs, and admin tools call it; nobody sets `order.Status` directly. That is what makes the
audit log complete, the realtime board truthful, and reports correct. If you are writing
`order.Status = ...` anywhere else, you are creating a bug that will surface as "the app said the car
was free but it wasn't".

## Statuses

```
New → Assigned → Accepted → Arrived → InProgress → Completed
                                          ↘ (any of the first four) → Cancelled
```

| Status | Meaning for the dispatcher | Driver.Status while in it |
|---|---|---|
| `New` | Nobody is on it. Turns red on the board after 2 min. | – |
| `Assigned` | Offered to a driver, waiting for accept. Has a timeout. | unchanged (still `Free`) |
| `Accepted` | Driver is heading to pickup. | `EnRoute` |
| `Arrived` | Driver at pickup, waiting for customer. | `EnRoute` |
| `InProgress` | Customer in the car. | `Busy` |
| `Completed` | Done, price and payment recorded. | back to `Free` |
| `Cancelled` | Ended without a ride. Has reason + who. | back to `Free` if it was theirs |

## Transitions

| Transition | From → To | Allowed actor | Required payload | Side effects |
|---|---|---|---|---|
| `Assign` | New → Assigned | Dispatcher, System (auto-dispatch) | `driverId` | set `DriverId`, `VehicleId` (driver's current), `AssignedAt`; offer to driver; start timeout |
| `Accept` | Assigned → Accepted | **the assigned** Driver | – | `AcceptedAt`; driver → `EnRoute`; notify customer |
| `Decline` | Assigned → New | the assigned Driver | `reason` | clear driver fields; notify dispatch (sound) |
| `Timeout` | Assigned → New | System | – | same as Decline, reason `timeout` |
| `Reassign` | Assigned/Accepted/Arrived → Assigned | Dispatcher | `driverId` | old driver → `Free` + notified; new driver offered; event `Reassigned` |
| `Arrive` | Accepted → Arrived | the assigned Driver | – | `ArrivedAt`; **SMS to customer** (the one SMS that always goes) |
| `Start` | Arrived → InProgress | the assigned Driver | – | `StartedAt`; driver → `Busy` |
| `Complete` | InProgress → Completed | the assigned Driver | `finalPriceCzk`, `paymentType`, `overrideReason` if price ≠ fixed | `CompletedAt`; driver → `Free`; event `PriceOverridden` when applicable |
| `Cancel` | New/Assigned/Accepted/Arrived → Cancelled | Dispatcher (any of these); Customer (New/Assigned/Accepted only); Driver (Arrived only, reason `no-show`, ≥ 5 min after `ArrivedAt`) | `reason` | `CancelledAt`, `CancelReason`, `CancelledByRole`; driver → `Free`; notify the other parties |

Anything not in the table is illegal and throws `InvalidTransitionException(from, transition, actorRole)`
which the API turns into `409 Conflict` with a human-readable Czech message.

Rules the table implies but people forget:
- "The assigned Driver" means `actor.DriverId == order.DriverId`. Another driver gets 403-style `InvalidTransition`, not a silent success.
- `Reassign` from `Accepted`/`Arrived` is allowed because phones die. It must release the old driver.
- `Complete` requires `paymentType`; the driver app must not let the button submit without it.
- `Cancel` after `InProgress` does not exist. If the ride ended abnormally, complete it with a note.
- Scheduled orders (`ScheduledAt` set) sit in `New` until the dispatcher assigns them; the reminder job only notifies, it never transitions.

## What every transition does (implemented once, in `OrderService.Transition`)

1. Load the order with its `Version` (row version). Reject with 409 if the client sent a stale version, when the endpoint carries one.
2. `OrderStateMachine.Apply(order, transition, actor, payload)` — validates the table above, mutates the order, returns an `OrderEvent` (`Type`, `FromStatus`, `ToStatus`, `ActorUserId`, `ActorRole`, `Payload` jsonb, `At`).
3. Update `Driver.Status` per the table, and open/close nothing on shifts (shifts are online/offline, not per ride).
4. Save order + event **in one transaction**. Write notification outbox rows in the same transaction.
5. After commit: `IRealtimePublisher.OrderChanged(orderDto)` to `fleet:{id}:dispatch`, `driver:{driverId}` (old and new on reassign), and `order:{orderId}`. Then `DriverStatusChanged` if it changed.

Never do step 5 before step 4 commits. A broadcast about a change that then rolls back is how the board lies.

## Timeouts

- `FleetSettings.OfferTimeoutSeconds` (default 45). `OfferTimeoutJob` polls every 5 s for `Assigned` orders with `AssignedAt + timeout < now` and applies `Timeout`. State lives in the DB, so restarts don't lose it.
- After a timeout or decline, the order is `New` again with a `DeclinedDriverIds` note in the event payload, so auto-dispatch (v1.1) can skip that driver next time. Store it in the event, not on the order.

## Prices are locked at creation

`PriceType`, `FixedPriceCzk`/`EstimatedPriceCzk`, `RouteId` are set when the order is created and never
recomputed by a transition. Only `Complete` sets `FinalPriceCzk`. If `FinalPriceCzk != FixedPriceCzk` on a
fixed-price order, `overrideReason` is mandatory (≥ 5 chars) and the event `PriceOverridden` is written
alongside `Completed`. Dispatcher UI highlights those orders.

## Displaying state (UI rules)

- Show the status in words the role understands, not the enum: customer sees "Řidič přijede za ~6 min",
  driver sees a single big button for the next transition, dispatcher sees the column.
- The UI only offers transitions the table allows for the current status and role. Compute the allowed
  set from one shared function (`OrderStateMachine.AllowedFor(status, role, isAssignedDriver)`) exposed in
  the order DTO as `allowedActions`, so the three frontends never re-encode the table.
- On 409 from the server, refetch the order and re-render; never retry blindly.

## Tests you must have

- One test per allowed transition (happy path, correct actor).
- One test per role for a disallowed transition (e.g. Customer tries `Arrive`; other driver tries `Accept`; Driver tries `Cancel` at 3 min after arrival).
- Reassign from `Accepted` releases the old driver and notifies both.
- Timeout job: assigned order older than the timeout goes back to `New` exactly once even if the job runs twice concurrently.
- Complete on a fixed-price order with a different price and no reason → rejected; with reason → `PriceOverridden` event exists.
- Broadcast happens only after commit (force a failing save and assert no publish).

## Checklist

- [ ] No `order.Status =` outside `OrderStateMachine`.
- [ ] Transition wrote exactly one `order_events` row.
- [ ] `Driver.Status` updated per table.
- [ ] Publish after commit; outbox rows in the same transaction.
- [ ] `allowedActions` in the DTO reflects the table; UI uses it.
- [ ] Tests above present and green.
