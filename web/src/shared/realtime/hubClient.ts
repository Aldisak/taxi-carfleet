import * as signalR from '@microsoft/signalr'
import { getReconnectDelay } from './reconnectBackoff'

const HUB_URL = (import.meta as ImportMeta & { env: { VITE_API_BASE_URL?: string } }).env
  ?.VITE_API_BASE_URL
  ? (import.meta as ImportMeta & { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL!
    .replace('/api/v1', '')
  : ''

/**
 * Custom retry policy that retries indefinitely using the backoff schedule
 * [0, 2000, 5000, 10000, 30000, 30000, ...] ms.
 * Never returns null — the board must stay connected all day.
 */
class InfiniteRetryPolicy implements signalR.IRetryPolicy {
  nextRetryDelayInMilliseconds(retryContext: signalR.RetryContext): number | null {
    return getReconnectDelay(retryContext.previousRetryCount)
  }
}

/**
 * Creates a new SignalR HubConnection to /hubs/fleet.
 * JWT is passed via the access_token query parameter (required by FleetHub).
 */
export function createHubConnection(getAccessToken: () => string | null): signalR.HubConnection {
  return new signalR.HubConnectionBuilder()
    .withUrl(`${HUB_URL}/hubs/fleet`, {
      accessTokenFactory: () => getAccessToken() ?? '',
    })
    .withAutomaticReconnect(new InfiniteRetryPolicy())
    .configureLogging(signalR.LogLevel.Warning)
    .build()
}
