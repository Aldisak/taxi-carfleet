# Driver PWA — platform limits (documented expectations)

This file records the **known platform constraints** of background location reporting and
screen wake-lock for the driver PWA (`/d`). These are documented expectations drawn from the
platform specs and vendor docs — **not** measurements taken on physical devices. Re-verify on
real hardware before the UC-003 demo and update the "observed" column when you do.

## Position reporting strategy (implemented)

- `navigator.geolocation.watchPosition({ enableHighAccuracy: true })` drives hub
  `UpdatePosition(lat, lng, heading, speed)` on the single `/hubs/fleet` connection.
- Client throttle (`positionThrottle.ts`): send at most every **3 s**, or early when moved
  **> 25 m** — whichever comes first. The "last sent" clock advances **only on a successful
  hub invoke**, so a failed send is retried and does not mask a real outage.
- Stale watchdog: if nothing is successfully sent for **60 s** while online, a red
  "Poloha se neodesílá" banner shows and the phone vibrates once (arm-once).
- Wake Lock (`useWakeLock.ts`) is acquired on the active-ride screen, feature-detected, and
  re-acquired on `visibilitychange → visible`.

## Android Chrome

| Aspect | Documented expectation |
|---|---|
| Foreground, screen on | `watchPosition` fires continuously; 3 s/25 m throttle works as designed. |
| Screen on, app backgrounded (another app on top) | Geolocation updates are throttled/suspended; the SignalR WebSocket may be torn down by the OS. Position reporting effectively pauses; the 60 s banner will fire when the app returns to foreground and no send has succeeded. |
| Screen off (device locked) | `watchPosition` stops; Wake Lock is released. No background location without a native service worker + Background Sync + geofencing, which this app deliberately does **not** use. |
| Wake Lock | Supported (Chrome 84+). Auto-released when the tab is hidden; re-acquired on return to foreground. |
| Installed PWA (standalone) | Same as Chrome tab — a standalone PWA is not a foreground service and gets no background-location exemption. |

**Expectation for the demo:** keep the driver app in the foreground with the screen on (Wake
Lock keeps it awake). This is the supported operating mode; background tracking is out of scope
for UC-003 (would require the deferred push / native-shell work in assignment 05).

## iOS Safari

| Aspect | Documented expectation |
|---|---|
| Foreground, screen on | `watchPosition` fires while the page is visible; throttle works as designed. |
| App backgrounded / screen off | Safari suspends timers, geolocation, and network for hidden tabs almost immediately. Position reporting stops; the SignalR connection drops and reconnects on return. |
| Wake Lock | `navigator.wakeLock` is supported from **iOS 16.4+**. On older iOS the hook no-ops (feature-detected) and the screen will dim/sleep per the system setting — advise drivers to raise the auto-lock time. |
| Installed PWA (Add to Home Screen) | Runs in a standalone WebView; same foreground-only constraints. No background location. |

**Expectation for the demo:** iOS is strictly foreground-only. On iOS < 16.4 the screen is not
kept awake by the app — rely on the device auto-lock setting.

## Consequences for dispatch

Because background tracking is not available on either platform, the dispatcher must treat a
driver who has backgrounded the app or locked the phone as **position-stale**. The server-side
`StalePositionJob` (WI-14) auto-offlines drivers whose last position is older than its threshold;
the driver app surfaces the same condition locally via the 60 s banner so the driver can bring
the app back to the foreground.
