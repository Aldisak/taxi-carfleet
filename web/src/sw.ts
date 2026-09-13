/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { parsePushPayload, toPushDisplay, resolveClickUrl, OFFER_TAG } from './shared/push/pushPayload'

// This file is compiled as the PWA service worker via vite-plugin-pwa `injectManifest`.
// It runs in a ServiceWorkerGlobalScope (no DOM) — keep imports pure (no window/DOM refs).
declare const self: ServiceWorkerGlobalScope

// Workbox injects the precache manifest here at build time. Without referencing
// `self.__WB_MANIFEST` the injectManifest build fails ("injection point not found").
precacheAndRoute(self.__WB_MANIFEST)

// App-shell navigation fallback (parity with the previous generateSW config): serve the
// precached index.html for SPA navigations so an offline deep-route reload still boots the app
// (spec §11 — never a blank screen offline). Never intercept API or SignalR hub routes.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api/, /^\/hubs/],
  }),
)

// registerType 'prompt' (vite.config.ts) activates a waiting SW only when the app posts
// SKIP_WAITING after the user accepts the update prompt. Without this listener the new SW
// never takes over (the generateSW strategy injected this automatically).
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

/**
 * Show a notification from a backend Web Push payload ({ title, body, url, tag, priority }).
 * OfferToDriver (priority high / tag 'offer') uses requireInteraction so it stays until the
 * driver acts, and notifies open clients so the in-app SignalR-driven offer sound can start
 * (the SW itself cannot play audio — sound is owned by useOfferSound).
 */
self.addEventListener('push', (event: PushEvent) => {
  const payload = parsePushPayload(event.data?.text())
  if (!payload) return

  const display = toPushDisplay(payload)

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(display.title, {
        body: display.body,
        tag: display.tag ?? undefined,
        requireInteraction: display.requireInteraction,
        data: { url: resolveClickUrl(display.url) },
      })

      if (display.isOffer) {
        // Nudge any open client(s) to start the offer sound (the SW cannot play audio itself).
        const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (const client of clientList) {
          client.postMessage({ type: 'push-offer', tag: OFFER_TAG })
        }
      }
    })(),
  )
})

/** On click, open or focus the payload url (already resolved into notification.data.url). */
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const data = event.notification.data as { url?: string } | undefined
  const url = resolveClickUrl(data?.url)

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Focus an existing tab on the same origin if one is open.
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client && client.url !== url) {
            try {
              await client.navigate(url)
            } catch {
              // navigate may reject cross-origin — fall through to openWindow below.
            }
          }
          return
        }
      }
      // Otherwise open a new window.
      if (self.clients.openWindow) {
        await self.clients.openWindow(url)
      }
    })(),
  )
})
