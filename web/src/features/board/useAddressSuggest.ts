import { useState, useEffect } from 'react'
import { getGeoSuggest } from '../../shared/api/client'
import type { GeoSuggestItem } from '../../shared/api/client'

const DEBOUNCE_MS = 350
const MIN_QUERY_LENGTH = 3

export interface AddressSuggestState {
  items: GeoSuggestItem[]
  isLoading: boolean
}

/**
 * Debounced address autocomplete hook calling GET /geo/suggest.
 * Returns an empty list when the query is shorter than MIN_QUERY_LENGTH.
 * On upstream failure the server returns 200 with an empty list — so this hook
 * never surfaces an error state; the form is never blocked.
 */
export function useAddressSuggest(query: string): AddressSuggestState & { clear: () => void } {
  const [state, setState] = useState<AddressSuggestState>({ items: [], isLoading: false })

  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setState({ items: [], isLoading: false })
      return
    }

    let cancelled = false
    setState(prev => ({ ...prev, isLoading: true }))

    const timer = setTimeout(async () => {
      if (cancelled) return
      try {
        const result = await getGeoSuggest(query.trim())
        if (!cancelled) setState({ items: result.items, isLoading: false })
      } catch {
        // Server returns 200+empty on upstream failure; other errors treated as no-op
        if (!cancelled) setState({ items: [], isLoading: false })
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  function clear() {
    setState({ items: [], isLoading: false })
  }

  return { ...state, clear }
}
