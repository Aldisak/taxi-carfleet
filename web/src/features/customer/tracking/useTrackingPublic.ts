import { useQuery } from '@tanstack/react-query'
import { getPublicTrack, ApiResponseError } from '../../../shared/api/client'
import type { TrackDto } from '../../../shared/api/client'

/** Returns true when the error is the 410 "tracking link expired" response. */
function isExpiredError(error: unknown): boolean {
  return error instanceof ApiResponseError && error.status === 410
}

/** Result of {@link useTrackingPublic}. */
export interface UseTrackingPublicResult {
  data: TrackDto | undefined
  isLoading: boolean
  /** True when the signed link is expired/invalid (410) — show "Odkaz vypršel" + call. */
  isExpired: boolean
  /** True for any non-410 error (e.g. 404 unknown code). */
  isError: boolean
}

/**
 * Logged-out tracking poll (public mode). Polls GET public/track/{code}?k={token} every 10 s
 * (FleetHub is [Authorize], so SignalR is unavailable logged-out — the client polls instead).
 * On a 410 it surfaces isExpired and STOPS polling (the link will never come back); retries are
 * disabled so the 410 reaches the UI immediately. Disabled entirely when the token is missing.
 */
export function useTrackingPublic(code: string, token: string | null): UseTrackingPublicResult {
  const query = useQuery({
    queryKey: ['orders', 'track', 'public', code, token],
    queryFn: () => getPublicTrack(code, token ?? ''),
    enabled: token != null && token.length > 0,
    retry: false,
    // Stop polling once the link is expired; keep polling otherwise.
    refetchInterval: (q) => (isExpiredError(q.state.error) ? false : 10_000),
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isExpired: isExpiredError(query.error),
    isError: query.isError && !isExpiredError(query.error),
  }
}
