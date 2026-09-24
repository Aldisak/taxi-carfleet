import type { DefaultTheme } from 'styled-components'
import type { DeskPillTone } from '../../shared/ui/desk'

export type DriverStatus = 'Free' | 'EnRoute' | 'Busy' | 'Offline'

export interface DriverStatusInfo {
  /** i18n key for the driver status label — pass to t() to get the localised string. */
  labelKey: string
  colorKey: keyof DefaultTheme['colors']
  textColorKey: keyof DefaultTheme['colors']
}

/**
 * Maps a DriverStatus string to its i18n label key and theme color keys.
 * Defaults to Offline/grey for unknown values.
 * The caller is responsible for translating `labelKey` via t().
 */
export function getDriverStatusInfo(status: DriverStatus): DriverStatusInfo {
  switch (status) {
    case 'Free':
      return { labelKey: 'status.driver.Free', colorKey: 'statusFree', textColorKey: 'statusFreeText' }
    case 'EnRoute':
      return { labelKey: 'status.driver.EnRoute', colorKey: 'statusEnRoute', textColorKey: 'statusEnRouteText' }
    case 'Busy':
      return { labelKey: 'status.driver.Busy', colorKey: 'statusBusy', textColorKey: 'statusBusyText' }
    case 'Offline':
    default:
      return { labelKey: 'status.driver.Offline', colorKey: 'statusOffline', textColorKey: 'statusOfflineText' }
  }
}

/**
 * Maps an order status string to a {@link DeskPillTone} for the desk-kit status pill
 * (dispatcher redesign §3). Additive to {@link getDriverStatusInfo} — the legacy theme-color
 * mapping is untouched. Unknown statuses fall back to `'neutral'`.
 */
export function getOrderStatusTone(status: string): DeskPillTone {
  switch (status) {
    case 'New':
      return 'info'
    case 'Assigned':
      return 'warning'
    case 'Accepted':
    case 'Arrived':
    case 'InProgress':
      return 'accent'
    case 'Completed':
      return 'success'
    case 'Cancelled':
      return 'danger'
    default:
      return 'neutral'
  }
}

/**
 * Maps a driver status string to a {@link DeskPillTone} for the desk-kit driver pill
 * (dispatcher redesign §3). Additive to {@link getDriverStatusInfo}. Unknown → `'neutral'`.
 */
export function getDriverStatusTone(status: string): DeskPillTone {
  switch (status) {
    case 'Free':
      return 'success'
    case 'EnRoute':
      return 'info'
    case 'Busy':
      return 'warning'
    case 'Offline':
    default:
      return 'neutral'
  }
}
