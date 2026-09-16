import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getGeoSuggest, type GeoSuggestItem } from '../../../shared/api/client'

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
 * Query key is hierarchical: ['geo','suggest', q] (rules/web-performance.md#query-keys).
 */
export function useSuggest(query: string): UseSuggestResult {
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), SUGGEST_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [query])

  const enabled = debounced.trim().length >= MIN_SUGGEST_CHARS

  const { data, isFetching } = useQuery({
    queryKey: ['geo', 'suggest', debounced],
    queryFn: () => getGeoSuggest(debounced),
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
