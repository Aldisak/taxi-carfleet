import { useEffect, useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getGeoReverse, type GeoReverseResponse } from '../../../shared/api/client'
import type { LatLng } from './centerPin'

/** Debounce window (ms) before the settled center coords are reverse-geocoded — avoids a call
 *  per intermediate frame while the user drags/zooms the map. Mirrors useSuggest's debounce. */
export const REVERSE_DEBOUNCE_MS = 300

/** Rounds a coordinate to 4 decimals — matches the backend Math.Round(..,4) and the getGeoReverse
 *  wire value, so the query key never thrashes on sub-metre map jitter. */
function roundCoord(value: number): number {
  return Math.round(value * 1e4) / 1e4
}

/**
 * Debounced, TanStack-cached reverse geocoding of a map-center coordinate to an address label
 * (UC-014 WI-4). Coordinate changes are debounced (REVERSE_DEBOUNCE_MS) and the query key is
 * hierarchical + coord-rounded (`['geo','reverse', roundedLat, roundedLng]`, matching the wire
 * value) so tiny map moves reuse the cache instead of refetching
 * (rules/web-performance.md#query-keys). The query is disabled until coords are present, so a
 * blank/uninitialised map never fires a request. Anonymous-by-slug via getGeoReverse.
 */
export function useReverseGeocode(coords: LatLng | null): UseQueryResult<GeoReverseResponse> {
  const [debounced, setDebounced] = useState<LatLng | null>(null)

  const roundedLat = coords ? roundCoord(coords.lat) : null
  const roundedLng = coords ? roundCoord(coords.lng) : null

  useEffect(() => {
    if (roundedLat === null || roundedLng === null) {
      setDebounced(null)
      return
    }
    const id = setTimeout(() => setDebounced({ lat: roundedLat, lng: roundedLng }), REVERSE_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [roundedLat, roundedLng])

  return useQuery({
    queryKey: ['geo', 'reverse', debounced?.lat ?? null, debounced?.lng ?? null],
    queryFn: () => getGeoReverse(debounced!.lat, debounced!.lng),
    enabled: debounced !== null,
    staleTime: 60_000,
  })
}
