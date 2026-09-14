/**
 * Resolves the fleet slug for the customer PWA (F-05).
 *
 * Resolution order (first match wins):
 *   1. Subdomain — `{slug}.{domain}` on a real multi-level production host
 *      (the canonical production source per spec §entry-points).
 *   2. `?fleet={slug}` query param — for localhost / preview where there is no subdomain.
 *   3. `/customer/f/{slug}` path segment — an alternative localhost hint.
 *   4. `'demo'` default — bare localhost with no hints, so the seeded demo fleet
 *      works out of the box for the Playwright harness.
 *
 * client.ts auto-attaches `X-Fleet-Slug` from `authStorage.getFleetSlug()`, and the
 * logged-out `public/*` calls 404 without a resolved slug, so CustomerLayout persists
 * this result BEFORE any public query mounts.
 *
 * @param hostname window.location.hostname
 * @param search   window.location.search (includes leading '?')
 * @param pathname window.location.pathname
 */
export function resolveFleetSlug(hostname: string, search: string, pathname: string): string {
  const DEFAULT_SLUG = 'demo'

  // 1. Subdomain — only on a real multi-level host (not an IP, not bare apex).
  const isIpLike = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
  if (!isIpLike && hostname !== 'localhost') {
    const labels = hostname.split('.')
    // Need at least sub.domain.tld; first label must not be a non-slug marker.
    if (labels.length >= 3 && labels[0] !== 'www' && labels[0] !== '') {
      return labels[0]
    }
  }

  // 2. ?fleet= query param.
  const params = new URLSearchParams(search)
  const fromQuery = params.get('fleet')
  if (fromQuery) {
    return fromQuery
  }

  // 3. /customer/f/{slug} path segment.
  const match = /\/customer\/f\/([^/?#]+)/.exec(pathname)
  if (match) {
    return match[1]
  }

  // 4. Default.
  return DEFAULT_SLUG
}
