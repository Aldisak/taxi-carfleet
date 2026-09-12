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
  /**
   * When true, the quote also runs for an anonymous visitor who has a fleet slug (A6 widened
   * pricing/quote to anonymous-by-slug). The Zone-route confirm screen opts in so a
   * logged-out customer can see the in-zone Fixed quote BEFORE the login step; the custom
   * order screen leaves this false (its quote is a preview, not a submit gate).
   */
  allowAnonymous?: boolean
}

/** Result of usePriceQuote. */
export interface UsePriceQuoteResult {
  view: PriceQuoteView | null
  isLoading: boolean
  /** i18n key for a quote failure (502 upstream), or null. */
  errorKey: string | null
}

/**
 * Loads a live price quote (POST /pricing/quote). Queries when pickup coords are resolved
 * AND the caller can quote: authenticated always, or anonymous-by-slug when allowAnonymous
 * is set (A6). Dropoff is optional (omit → a wide estimate / Meter). The pure interpretQuote
 * maps the response to a structured view (Fixed price, an Estimate RANGE — never a single
 * exact estimate, AC #4 — or a Meter fallback). A 502 upstream
 * failure surfaces the 'quoteUnavailable' i18n key so the component shows
 * "Cenu nelze spočítat, zavolejte nám".
 *
 * Query key is hierarchical and coord-scoped (rules/web-performance.md#query-keys).
 */
export function usePriceQuote(args: PriceQuoteArgs): UsePriceQuoteResult {
  const { pickupLat, pickupLng, dropoffLat, dropoffLng, allowAnonymous = false } = args
  const hasToken = authStorage.getAccessToken() !== null
  // A6 widened pricing/quote to any authenticated role + anonymous-by-slug. A preview-only
  // caller stays token-gated; a caller that opts in can quote with just a fleet slug.
  const canQuote = hasToken || (allowAnonymous && authStorage.getFleetSlug() !== null)
  const enabled = canQuote && pickupLat != null && pickupLng != null

  const { data, isFetching, isError } = useQuery({
    queryKey: ['pricing', 'quote', pickupLat, pickupLng, dropoffLat, dropoffLng],
    queryFn: () =>
      getPriceQuote({ pickupLat: pickupLat!, pickupLng: pickupLng!, dropoffLat, dropoffLng }),
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
