import { useQuery } from '@tanstack/react-query'
import { getPriceQuote } from '../../../../shared/api/client'
import { interpretQuote, type PriceQuoteView } from '../../../../shared/pricing/interpretQuote'

/** Inputs for the dispatcher "Otestovat" quote probe. */
export interface RouteTestQuoteArgs {
  pickupLat: number | null
  pickupLng: number | null
  dropoffLat: number | null
  dropoffLng: number | null
  /** Optional ISO timestamp to evaluate route validity at (night-tariff test); null → now. */
  at: string | null
}

/** Result of useRouteTestQuote. */
export interface UseRouteTestQuoteResult {
  view: PriceQuoteView | null
  isLoading: boolean
  /** i18n key for a quote failure (502 upstream), or null. */
  errorKey: string | null
}

/**
 * The dispatcher Settings "Otestovat" panel quote probe. Unlike the customer usePriceQuote
 * this one threads `at` (so a FleetAdmin can verify a night-only route at e.g. 03:30) and is
 * always token-gated (the Settings area is FleetAdmin-only, never anonymous). Reuses the
 * shared POST /pricing/quote client + the shared interpretQuote
 * (rules/web-architecture.md#pure-logic-modules). `at` is part of the query key so changing
 * the test time refetches (rules/web-performance.md#query-keys).
 */
export function useRouteTestQuote(args: RouteTestQuoteArgs): UseRouteTestQuoteResult {
  const { pickupLat, pickupLng, dropoffLat, dropoffLng, at } = args
  const enabled = pickupLat != null && pickupLng != null

  const { data, isFetching, isError } = useQuery({
    queryKey: ['pricing', 'quote', 'test', pickupLat, pickupLng, dropoffLat, dropoffLng, at],
    queryFn: () =>
      getPriceQuote({ pickupLat: pickupLat!, pickupLng: pickupLng!, dropoffLat, dropoffLng, at }),
    enabled,
    staleTime: 30_000,
    retry: false,
  })

  return {
    view: data ? interpretQuote(data) : null,
    isLoading: enabled && isFetching,
    errorKey: isError ? 'settings.routes.test.quoteUnavailable' : null,
  }
}
