/**
 * Push configuration reader. The VAPID public key is a build-time dev config value
 * (`VITE_VAPID_PUBLIC_KEY`); prod secret wiring is deferred to assignment 08 (documented).
 *
 * Isolated in its own module so tests can `vi.mock` it — vitest's `import.meta.env` is not
 * reliably mutable across module boundaries, so reading the key here keeps `usePushSubscription`
 * testable without fighting the env plumbing.
 */
export function getVapidPublicKey(): string {
  return (
    (import.meta as ImportMeta & { env: { VITE_VAPID_PUBLIC_KEY?: string } }).env
      ?.VITE_VAPID_PUBLIC_KEY ?? ''
  )
}
