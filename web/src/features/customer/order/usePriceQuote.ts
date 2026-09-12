import { useQuery } from '@tanstack/react-query'
import { getPriceQuote } from '../../../shared/api/client'
import { authStorage } from '../../../shared/api/auth-storage'
import { interpretQuote, type PriceQuoteView } from './priceQuote'

/** Pickup/dropoff coordinates that drive a live price quote. */
export interface PriceQuoteArgs {
  pickupLat: number | null
  pickupLng: number | null
  dropoffLat: number | null
  dropoffLng: number | null
}

/** Result of usePriceQuote. */
export interface UsePriceQuoteResult {
  view: PriceQuoteView | null
  isLoading: boolean
  /** i18n key for a quote failure (502 upstream), or null. */
  errorKey: string | null
}

/**
 * Loads a live price quote for the custom order (GET /pricing/quote). Queries only when
 * authenticated (CustomerOnly) and pickup coords are resolved; dropoff is optional (omit →
 * a wide estimate). The pure interpretQuote maps the response to a structured view (Fixed
 * price or an Estimate RANGE — never a single exact estimate, AC #4). A 502 upstream
 * failure surfaces the 'quoteUnavailable' i18n key so the component shows
 * "Cenu nelze spočítat, zavolejte nám".
 *
 * Query key is hierarchical and coord-scoped (rules/web-performance.md#query-keys).
 */
export function usePriceQuote(args: PriceQuoteArgs): UsePriceQuoteResult {
  const { pickupLat, pickupLng, dropoffLat, dropoffLng } = args
  const hasToken = authStorage.getAccessToken() !== null
  const enabled = hasToken && pickupLat != null && pickupLng != null

  const { data, isFetching, isError } = useQuery({
    queryKey: ['pricing', 'quote', pickupLat, pickupLng, dropoffLat, dropoffLng],
    queryFn: () =>
      getPriceQuote({ fromLat: pickupLat!, fromLng: pickupLng!, toLat: dropoffLat, toLng: dropoffLng }),
    enabled,
    staleTime: 30_000,
    retry: false,
  })

  return {
    view: data ? interpretQuote(data) : null,
    isLoading: enabled && isFetching,
    errorKey: isError ? 'customer.custom.quoteUnavailable' : null,
  }
}
