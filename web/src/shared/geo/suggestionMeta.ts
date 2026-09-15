import type { GeoSuggestItem } from '../api/client'

/**
 * Builds the secondary "street · municipality" line shown under a suggestion label so two
 * same-named places are distinguishable — e.g. "Náměstí, Kolín" vs "Náměstí, Kutná Hora" (AC#2).
 * Returns null when neither part is present (an older/flat payload). Consumers render the result
 * as PLAIN TEXT inside the <li role="option"> (never aria-hidden) so it is part of the option's
 * accessible name for screen-reader users.
 *
 * Shared by the dispatcher board form, the dispatcher order-edit drawer, and the customer
 * address autocomplete (rules/web-architecture.md — code used by 2+ features lives in shared/).
 */
export function suggestionMeta(item: GeoSuggestItem): string | null {
  const parts = [item.street, item.municipality].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0,
  )
  return parts.length > 0 ? parts.join(' · ') : null
}
