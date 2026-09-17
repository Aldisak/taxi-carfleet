import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getGeoSuggest, type GeoSuggestItem } from '../../../shared/api/client'
import type { LatLng } from '../shell/mapCamera'

/** Minimum query length before geo/suggest is called (matches the backend 3-char floor). */
export const MIN_SUGGEST_CHARS = 3

/** Debounce window (ms) before a settled query is sent — avoids a call per keystroke. */
export const SUGGEST_DEBOUNCE_MS = 300

/** Result of useSuggest. */
export interface UseSuggestResult {
  items: GeoSuggestItem[]
  isLoading: boolean
  /** True once a >= 3-char query has settled and the server returned an empty list. */
  isEmpty: boolean
}

/**
 * Debounced address autocomplete over GET /geo/suggest. Queries for >= 3 chars regardless of
 * auth state — geo/suggest is anonymous-by-slug (UC-014 WI-1 relaxed it to AllowAnonymous), so a
 * logged-out visitor gets the dropdown too (the fleet is resolved from the X-Fleet-Slug header
 * attached by apiRequest). On upstream failure the endpoint returns 200-empty, so an empty list is
 * the "Žádné návrhy" case, not an error.
 *
 * Query key is hierarchical: ['geo','suggest', debounced, near] (rules/web-performance.md#query-keys).
 * A `near` change re-queries and caches per location; `near` is NOT debounced (only the text is), and
 * because it is coarse-rounded upstream in suggestLocation.ts, tiny map nudges keep the same key so
 * there is no thrash. TanStack hashes the key by value, so a fresh-but-equal `near` object does not
 * refetch — hence no useMemo is needed (rules/web-performance.md#memoization-policy).
 */
export function useSuggest(query: string, near?: LatLng | null): UseSuggestResult {
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), SUGGEST_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [query])

  const enabled = debounced.trim().length >= MIN_SUGGEST_CHARS

  const { data, isFetching } = useQuery({
    queryKey: ['geo', 'suggest', debounced, near ?? null],
    queryFn: () => getGeoSuggest(debounced, near),
    enabled,
    staleTime: 30_000,
  })

  const items = data?.items ?? []

  return {
    items,
    isLoading: enabled && isFetching,
    isEmpty: enabled && !isFetching && data != null && items.length === 0,
  }
}
