import { useQuery } from '@tanstack/react-query'
import { getPlaces } from '../../shared/api/client'
import { QUICK_CHIPS, type QuickChip } from './quickChips'

/** A pickup quick-chip: a label + fixed coordinates. Sourced from fleet Places, else QUICK_CHIPS. */
export type OrderFormChip = QuickChip

/**
 * Board-local hook that supplies the pickup quick-chips from the fleet's configured
 * Places (GET /places), falling back to the hardcoded {@link QUICK_CHIPS} when the
 * Places query is empty, errors, or has not resolved yet.
 *
 * Deliberately board-local (no cross-feature import of the settings `usePlaces`) per
 * `rules/web-architecture.md#feature-folders`. Only enabled Places are returned, in the
 * backend's `sortOrder`.
 */
export function useOrderFormPlaces(): OrderFormChip[] {
  const { data } = useQuery({
    queryKey: ['places'],
    queryFn: getPlaces,
    staleTime: 5 * 60_000,
  })

  const placeChips: OrderFormChip[] = (data ?? [])
    .filter((p) => p.isEnabled)
    .map((p) => ({ label: p.name, address: p.address, lat: p.lat, lng: p.lng }))

  return placeChips.length > 0 ? placeChips : [...QUICK_CHIPS]
}
