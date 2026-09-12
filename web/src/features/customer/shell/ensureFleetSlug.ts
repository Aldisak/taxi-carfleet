import { authStorage } from '../../../shared/api/auth-storage'
import { resolveFleetSlug } from './resolveFleetSlug'

/**
 * F-05: resolve the fleet slug from the current URL and persist it to authStorage,
 * so the logged-out GET public/fleet and customer auth calls carry X-Fleet-Slug
 * (client.ts attaches it automatically). Idempotent — safe to call on every mount.
 *
 * MUST run before any public/auth request fires. Both the /c shell (CustomerLayout)
 * and the standalone /c/login page (which is NOT a child of CustomerLayout) call this,
 * because authStorage.clear() wipes the slug and a direct hit to /c/login would
 * otherwise 404 on localhost.
 *
 * @returns the resolved slug.
 */
export function ensureFleetSlug(): string {
  const slug = resolveFleetSlug(
    window.location.hostname,
    window.location.search,
    window.location.pathname,
  )
  authStorage.setFleetSlug(slug)
  return slug
}
